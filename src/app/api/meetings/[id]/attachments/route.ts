import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { ALLOWED_ATTACHMENT_MIME, MAX_ATTACHMENT_SIZE, saveAttachmentFile } from "@/lib/attachments";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id: meetingId } = await ctx.params;

  const attachments = await prisma.attachment.findMany({
    where: { meetingId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(attachments.map((a) => ({
    id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
    agendaItemId: a.agendaItemId,
    visibleToParticipants: a.visibleToParticipants, visibleToPublic: a.visibleToPublic,
    createdAt: a.createdAt,
  })));
}

/** POST /api/meetings/[id]/attachments - wgranie materiału (multipart/form-data). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id: meetingId } = await ctx.params;

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return new NextResponse("Meeting not found", { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return new NextResponse("Brak pliku", { status: 400 });
  if (!ALLOWED_ATTACHMENT_MIME[file.type]) return new NextResponse("Dozwolone: PDF, DOCX, XLSX, PNG, JPG, WEBP", { status: 400 });
  if (file.size > MAX_ATTACHMENT_SIZE) return new NextResponse("Plik za duży (max 20 MB)", { status: 400 });

  const agendaItemId = (form?.get("agendaItemId") as string | null) || null;
  if (agendaItemId) {
    const item = await prisma.agendaItem.findFirst({ where: { id: agendaItemId, meetingId } });
    if (!item) return new NextResponse("Nie znaleziono punktu porządku", { status: 400 });
  }

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const visParticipantsRaw = form?.get("visibleToParticipants");
  const visPublicRaw = form?.get("visibleToPublic");
  const visibleToParticipants = visParticipantsRaw != null
    ? visParticipantsRaw === "true"
    : (settings?.defaultMaterialsVisibleToParticipants ?? true);
  const visibleToPublic = visPublicRaw != null
    ? visPublicRaw === "true"
    : (settings?.defaultMaterialsPublic ?? false);

  const { storedName } = await saveAttachmentFile(file);

  const attachment = await prisma.attachment.create({
    data: {
      meetingId, agendaItemId,
      fileName: file.name.slice(0, 255),
      storedName, mimeType: file.type, sizeBytes: file.size,
      visibleToParticipants, visibleToPublic,
      uploadedByUserId: session.user.id,
    },
  });

  await audit({
    action: "ATTACHMENT_UPLOADED",
    description: `Dodano materiał "${attachment.fileName}"`,
    meetingId, userId: session.user.id,
  });

  return NextResponse.json({ ok: true, id: attachment.id });
}
