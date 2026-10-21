import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { letterForViewer } from "@/lib/inquiryLetterAccess";
import { loadInquiry } from "@/lib/inquiryDetail";
import { letterPdf } from "@/lib/inquiryPdf";
import { caseFileBase, orgName, pdfCaseFromView } from "@/lib/inquiryPdfData";
import { fileResponse, MIME } from "@/lib/serverPdf";

/** GET - PDF jednego pisma z treści zapisanej w aplikacji (te same uprawnienia co karta sprawy). */
export async function GET(_req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("inquiry letter pdf", async () => {
    const { letter } = await letterForViewer(lid, session.user);
    const v = await loadInquiry(letter.caseId, session.user);
    if (!v || !v.letters.some((l) => l.id === lid)) throw new HttpError(404, "Nie znaleziono");
    const idx = v.letters.findIndex((l) => l.id === lid) + 1;
    return fileResponse(await letterPdf(pdfCaseFromView(v), lid, await orgName()), `${caseFileBase(v)}-pismo-${idx}${letter.state === "DRAFT" ? "-projekt" : ""}.pdf`, MIME.pdf);
  });
}
