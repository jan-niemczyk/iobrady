import { NextResponse } from "next/server";
import { loadPublicCase } from "@/lib/inquiryPublic";
import { casePdf, letterPdf } from "@/lib/inquiryPdf";
import { caseFileBase, orgName } from "@/lib/inquiryPdfData";
import { fileResponse, MIME } from "@/lib/serverPdf";
import { serverError } from "@/lib/http";

/** GET - publiczny PDF sprawy albo pisma (?pismo=ID): wyłącznie wersja dopuszczona do publikacji. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await loadPublicCase(id);
  if (!c) return new NextResponse("Not found", { status: 404 });
  const letterId = new URL(req.url).searchParams.get("pismo");
  try {
    if (letterId) {
      if (!c.letters.some((l) => l.id === letterId)) return new NextResponse("Not found", { status: 404 });
      return fileResponse(await letterPdf(c, letterId, await orgName()), `${caseFileBase(c)}-pismo.pdf`, MIME.pdf);
    }
    return fileResponse(await casePdf(c, await orgName()), `${caseFileBase(c)}.pdf`, MIME.pdf);
  } catch (e) {
    return serverError("public inquiry pdf", e);
  }
}
