import { auth } from "@/lib/auth";
import { canManageBySpeakerEntry, canManageMeeting } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";

async function loadEntry(id: string) {
  return prisma.speakerListEntry.findUnique({
    where: { id },
    include: { list: true, user: true },
  });
}

// PATCH - przesunięcie góra/dół lub edycja limitu czasu
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canManageBySpeakerEntry(session, id)))
    return new NextResponse("Forbidden", { status: 403 });
  const body = await req.json().catch(() => ({}));

  const entry = await loadEntry(id);
  if (!entry) return new NextResponse("Not found", { status: 404 });

  if (body.move === "up" || body.move === "down") {
    // Sąsiada szukamy WYŁĄCZNIE w tej samej kategorii zgłoszenia (REGULAR/AD_VOCEM/FORMAL_MOTION),
    // bo każda kategoria ma własną bazę kolejności. Bez tego filtra przesuwanie mieszało kategorie
    // i wyglądało, jakby "nie działało".
    const neighbor = await prisma.speakerListEntry.findFirst({
      where: {
        speakerListId: entry.speakerListId,
        entryType: entry.entryType,
        order: body.move === "up" ? { lt: entry.order } : { gt: entry.order },
      },
      orderBy: { order: body.move === "up" ? "desc" : "asc" },
    });
    if (neighbor) {
      await prisma.$transaction(async (tx) => {
        const tmp = -1 * (Date.now() + Math.floor(Math.random() * 1000));
        await tx.speakerListEntry.update({ where: { id: entry.id }, data: { order: tmp } });
        await tx.speakerListEntry.update({ where: { id: neighbor.id }, data: { order: entry.order } });
        await tx.speakerListEntry.update({ where: { id: entry.id }, data: { order: neighbor.order } });
      });
    }
  } else if (typeof body.priority === "boolean") {
    // Priorytet: oznacz wpis i - gdy włączany - podbij go na początek jego kategorii
    // (przed wszystkie oczekujące wpisy tego samego typu).
    if (body.priority) {
      const first = await prisma.speakerListEntry.findFirst({
        where: { speakerListId: entry.speakerListId, entryType: entry.entryType },
        orderBy: { order: "asc" },
      });
      const newOrder = first ? first.order - 1 : entry.order;
      await prisma.speakerListEntry.update({
        where: { id }, data: { priority: true, order: newOrder },
      });
    } else {
      await prisma.speakerListEntry.update({
        where: { id }, data: { priority: false },
      });
    }
  } else if (typeof body.timeLimitSec === "number" || body.timeLimitSec === null) {
    await prisma.speakerListEntry.update({
      where: { id }, data: { timeLimitSec: body.timeLimitSec },
    });
  } else if (typeof body.addSeconds === "number") {
    // Dynamiczna korekta podczas trwającego wystąpienia.
    // Dodajemy do `timeAdjustmentSec` zamiast `timeLimitSec` żeby zachować pierwotny limit.
    await prisma.speakerListEntry.update({
      where: { id }, data: { timeAdjustmentSec: { increment: body.addSeconds } },
    });
  } else {
    return new NextResponse("Bad request", { status: 400 });
  }

  publishToMeeting(entry.list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}

// DELETE - usunięcie wpisu (lub operator usuwa innego; uczestnik tylko siebie)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const entry = await loadEntry(id);
  if (!entry) return new NextResponse("Not found", { status: 404 });

  const isOperator = session.user.role === "OPERATOR";
  const isSelf = entry.userId === session.user.id;
  const canManage = isOperator || (await canManageMeeting(session, entry.list.meetingId));
  if (!canManage && !isSelf) return new NextResponse("Forbidden", { status: 403 });

  // jeśli już przemawia - nie usuwamy, tylko zamykamy
  if (entry.status === "SPEAKING")
    return new NextResponse("Wpis jest aktywny - zakończ wystąpienie zamiast usuwać", { status: 400 });

  await prisma.speakerListEntry.delete({ where: { id } });
  publishToMeeting(entry.list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}
