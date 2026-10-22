import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled, requireSubmitRight } from "@/lib/inquiryAccess";
import { filtersFromParams, listInquiries } from "@/lib/inquiryList";
import { formatNumber, nextSeq, notify, numberPeriod, refreshStatus } from "@/lib/inquiries";

/** GET - rejestr (operator) albo własne sprawy (radny). Odczyt działa także przy wyłączonym module. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await listInquiries(session.user, filtersFromParams(new URL(req.url).searchParams)));
}

const date = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "Nieprawidłowa data.");
const schema = z.object({
  kind: z.enum(["INTERPELLATION", "QUESTION"]),
  title: z.string().trim().min(1, "Podaj tytuł.").max(500),
  body: z.string().max(200_000).default(""),
  addressees: z.array(z.object({ name: z.string().trim().min(1).max(300), institution: z.string().trim().max(300).optional().nullable() })).max(30).default([]),
  coAuthorUserIds: z.array(z.string().max(64)).max(50).default([]),
  orgUnitId: z.string().max(64).optional().nullable(),
  meetingId: z.string().max(64).optional().nullable(),
  // Rejestracja przez operatora pisma otrzymanego poza aplikacją:
  authors: z.array(z.object({ userId: z.string().max(64).optional().nullable(), name: z.string().trim().min(1).max(300) })).max(50).optional(),
  receivedAt: date.optional(),
  letterDate: date.optional().nullable(),
  registerNow: z.boolean().optional(),
});

/**
 * POST - nowa sprawa.
 *  - Radny (prawo „Składanie interpelacji i zapytań”): szkic; współautorzy jako zaproszeni (PENDING) -
 *    autorami stają się dopiero po potwierdzeniu.
 *  - Operator: pismo otrzymane poza aplikacją z rzeczywistą datą wpływu; autorzy pisma pozostają
 *    autorami (potwierdzenie OPERATOR = udokumentowane wspólne pismo), operator jest osobą wprowadzającą.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  return guarded("inquiries POST", async () => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const isOperator = session.user.role === "OPERATOR";
    if (isOperator) await requireModuleEnabled();
    else await requireSubmitRight(session.user.id, d.orgUnitId ?? null);
    if (d.orgUnitId && !(await prisma.orgUnit.findUnique({ where: { id: d.orgUnitId } }))) throw new HttpError(400, "Nie znaleziono grupy.");
    if (d.meetingId && !(await prisma.meeting.findUnique({ where: { id: d.meetingId } }))) throw new HttpError(400, "Nie znaleziono posiedzenia.");

    if (isOperator) {
      if (!d.authors?.length) throw new HttpError(400, "Podaj autora pisma.");
      if (!d.receivedAt) throw new HttpError(400, "Podaj datę wpływu.");
      const receivedAt = new Date(d.receivedAt);
      const c = await prisma.$transaction(async (tx) => {
        const c = await tx.inquiryCase.create({
          data: {
            kind: d.kind, title: d.title, orgUnitId: d.orgUnitId || null, meetingId: d.meetingId || null,
            createdById: session.user.id, enteredById: session.user.id, receivedAt, status: "SUBMITTED",
            authors: { create: d.authors!.map((a, i) => ({ userId: a.userId || null, name: a.name, isPrimary: i === 0, confirmation: "OPERATOR", confirmedAt: new Date() })) },
            addressees: { create: d.addressees.map((a, i) => ({ name: a.name, institution: a.institution || null, order: i })) },
            letters: { create: { seq: 1, kind: "SUBMISSION", authorName: d.authors!.map((a) => a.name).join(", "), title: d.title, body: d.body, letterDate: d.letterDate ? new Date(d.letterDate) : null, receivedAt, state: "FINAL", finalizedAt: new Date(), createdById: session.user.id } },
          },
        });
        if (d.registerNow) {
          const period = await numberPeriod(receivedAt, tx);
          const seq = await nextSeq(tx, d.kind, period);
          await tx.inquiryCase.update({ where: { id: c.id }, data: { seq, period, number: formatNumber(seq, period), registeredAt: new Date(), registeredById: session.user.id } });
        }
        await refreshStatus(tx, c.id);
        await audit({ action: "INQUIRY_CHANGED", description: `Wprowadzono pismo otrzymane poza aplikacją: „${d.title}”`, userId: session.user.id, metadata: { caseId: c.id, kind: d.kind } }, tx);
        const authorIds = d.authors!.map((a) => a.userId).filter((x): x is string => !!x);
        await notify(tx, authorIds, `Zarejestrowano pismo: ${d.title}`, `/session/interpelacje/${c.id}`);
        return c;
      });
      return NextResponse.json({ ok: true, id: c.id });
    }

    const me = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { firstName: true, lastName: true } });
    const co = d.coAuthorUserIds.filter((x) => x !== session.user.id);
    const coUsers = co.length ? await prisma.user.findMany({ where: { id: { in: co }, active: true, role: "PARTICIPANT" }, select: { id: true, firstName: true, lastName: true } }) : [];
    const c = await prisma.$transaction(async (tx) => {
      const c = await tx.inquiryCase.create({
        data: {
          kind: d.kind, title: d.title, orgUnitId: d.orgUnitId || null, meetingId: d.meetingId || null, createdById: session.user.id, status: "DRAFT",
          authors: { create: [
            { userId: session.user.id, name: `${me.firstName} ${me.lastName}`, isPrimary: true, confirmation: "SELF", confirmedAt: new Date() },
            ...coUsers.map((u) => ({ userId: u.id, name: `${u.firstName} ${u.lastName}`, confirmation: "PENDING" })),
          ] },
          addressees: { create: d.addressees.map((a, i) => ({ name: a.name, institution: a.institution || null, order: i })) },
          letters: { create: { seq: 1, kind: "SUBMISSION", title: d.title, body: d.body, state: "DRAFT", createdById: session.user.id } },
        },
      });
      await audit({ action: "INQUIRY_CHANGED", description: `Utworzono szkic: „${d.title}”`, userId: session.user.id, metadata: { caseId: c.id, kind: d.kind } }, tx);
      return c;
    });
    return NextResponse.json({ ok: true, id: c.id });
  });
}
