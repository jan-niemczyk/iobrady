import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireResponder, responderCase, responderPdfCase } from "@/lib/responder";
import { casePdf, letterPdf } from "@/lib/inquiryPdf";
import { caseFileBase, orgName } from "@/lib/inquiryPdfData";
import { fileResponse, MIME } from "@/lib/serverPdf";

/** GET - PDF pisma widocznego dla odpowiadającego; `lid` = „sprawa-<id>” -> PDF widocznej korespondencji. */
export async function GET(_req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("responder pdf", async () => {
    await requireResponder(session.user);
    if (lid.startsWith("sprawa-")) {
      const c = await responderCase(session.user.id, lid.slice(7));
      return fileResponse(await casePdf(responderPdfCase(c), await orgName()), `${caseFileBase(c)}.pdf`, MIME.pdf);
    }
    const l = await prisma.inquiryLetter.findUnique({ where: { id: lid }, select: { caseId: true } });
    if (!l) throw new HttpError(404, "Nie znaleziono");
    const c = await responderCase(session.user.id, l.caseId);
    if (!c.letters.some((x) => x.id === lid)) throw new HttpError(404, "Nie znaleziono");
    return fileResponse(await letterPdf(responderPdfCase(c), lid, await orgName()), `${caseFileBase(c)}-pismo.pdf`, MIME.pdf);
  });
}
