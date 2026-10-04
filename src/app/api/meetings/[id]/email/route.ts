import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MailNotConfiguredError, sendMail } from "@/lib/mail";
import { meetingAdHocEmail } from "@/lib/mailTemplates";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appOrigin, validationError } from "@/lib/http";

const schema = z.object({
  userIds: z.array(z.string()).min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  includePublicLink: z.boolean().optional().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id: meetingId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;

  const [meeting, settings, users] = await Promise.all([
    prisma.meeting.findUnique({ where: { id: meetingId } }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.user.findMany({ where: { id: { in: d.userIds } }, select: { email: true } }),
  ]);
  if (!meeting) return new NextResponse("Meeting not found", { status: 404 });
  if (users.length === 0) return new NextResponse("Brak odbiorców", { status: 400 });

  const publicUrl = d.includePublicLink && meeting.publicEnabled
    ? `${appOrigin(req)}/public/${meeting.id}` : undefined;

  const { subject, html } = meetingAdHocEmail({
    orgName: settings?.organizationName ?? "iOBRADY",
    subject: d.subject, bodyText: d.body, publicUrl,
  });

  try {
    await sendMail({
      to: users.map((u) => u.email), subject, html,
      kind: "meeting_adhoc", meetingId, sentByUserId: session.user.id,
    });
  } catch (e) {
    // Szczegóły błędu SMTP tylko w logu i EmailLog (diagnostyka: Ustawienia -> test e-mail).
    console.error("[mail]", e);
    return new NextResponse(e instanceof MailNotConfiguredError ? e.message : "Nie udało się wysłać wiadomości. Sprawdź konfigurację SMTP (Ustawienia - test e-mail).", { status: 400 });
  }

  return NextResponse.json({ ok: true, count: users.length });
}
