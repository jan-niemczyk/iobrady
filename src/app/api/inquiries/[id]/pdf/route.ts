import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { loadInquiry } from "@/lib/inquiryDetail";
import { casePdf } from "@/lib/inquiryPdf";
import { caseFileBase, orgName, pdfCaseFromView } from "@/lib/inquiryPdfData";
import { fileResponse, MIME } from "@/lib/serverPdf";

/** GET - zbiorczy PDF korespondencji sprawy (kolejność chronologiczna). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("inquiry case pdf", async () => {
    const v = await loadInquiry(id, session.user);
    if (!v) throw new HttpError(404, "Nie znaleziono");
    return fileResponse(await casePdf(pdfCaseFromView(v), await orgName()), `${caseFileBase(v)}-korespondencja.pdf`, MIME.pdf);
  });
}
