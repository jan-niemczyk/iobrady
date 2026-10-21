import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { audit } from "@/lib/audit";
import { normalizeAgenda, normalizeContent, normalizeRecipients } from "@/lib/noticeText";
import { noticeValues } from "@/lib/notices";
import { buildNoticeDocx, logoFilePath } from "@/lib/noticeDocx";
import { fileResponse, MIME } from "@/lib/serverPdf";
import { serverError } from "@/lib/http";

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "dokument";

/**
 * GET ?tryb=ogolny|imienny - DOCX zawiadomienia z zapisanej wersji roboczej.
 * Ogólny: jeden dokument bez danych adresata. Imienny: osobny DOCX dla każdego adresata (ZIP przy
 * kilku) - dokument jednej osoby nie zawiera danych pozostałych. Wygenerowanie nie oznacza wysłania.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("tryb") === "imienny" ? "personal" : "general";
  const n = await prisma.notice.findUnique({ where: { id }, include: { meeting: { select: { number: true } } } });
  if (!n) return new NextResponse("Nie znaleziono zawiadomienia", { status: 404 });
  const content = normalizeContent(n.content);
  const agenda = normalizeAgenda(n.agenda);
  const recipients = normalizeRecipients(n.recipients);
  if (mode === "personal" && recipients.length === 0) return new NextResponse("Brak adresatów - dodaj adresatów albo wygeneruj dokument ogólny.", { status: 400 });
  const values = await noticeValues(n.meetingId, content);
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { presentationLogoUrl: true } });
  const logoPath = logoFilePath(settings?.presentationLogoUrl);
  const base = `zawiadomienie-${slug(n.meeting.number)}`;
  try {
    let res: Response;
    if (mode === "general") {
      res = fileResponse(await buildNoticeDocx({ content, agenda, recipient: null, values, logoPath }), `${base}.docx`, MIME.docx);
    } else if (recipients.length === 1) {
      res = fileResponse(await buildNoticeDocx({ content, agenda, recipient: recipients[0], values, logoPath }), `${base}-${slug(recipients[0].name)}.docx`, MIME.docx);
    } else {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const [i, r] of recipients.entries()) {
        let name = `${String(i + 1).padStart(2, "0")}-${slug(r.name)}.docx`;
        while (used.has(name)) name = name.replace(/\.docx$/, "-1.docx");
        used.add(name);
        zip.file(name, await buildNoticeDocx({ content, agenda, recipient: r, values, logoPath }));
      }
      res = fileResponse(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), `${base}-imienne.zip`, MIME.zip);
    }
    await prisma.notice.update({ where: { id }, data: { lastGeneratedAt: new Date() } });
    await audit({ action: "NOTICE_GENERATED", description: `Wygenerowano zawiadomienie DOCX (${mode === "general" ? "ogólne" : `imienne: ${recipients.length}`})`, meetingId: n.meetingId, userId: session.user.id, metadata: { noticeId: id, mode, recipients: mode === "general" ? 0 : recipients.length } });
    return res;
  } catch (e) { return serverError("notice-docx", e); }
}
