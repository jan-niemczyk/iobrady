import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/booth";

/**
 * Pismo wraz ze sprawą i rolą osoby: operator widzi pisma utrwalone (i pismo wnoszące sprawy,
 * którą sam wprowadza); autor sprawy - pisma utrwalone i własne szkice. Inaczej 404.
 */
export async function letterForViewer(lid: string, viewer: { id: string; role: string }) {
  const l = await prisma.inquiryLetter.findUnique({ where: { id: lid }, include: { case: { include: { authors: true } } } });
  if (!l) throw new HttpError(404, "Nie znaleziono");
  const isOperator = viewer.role === "OPERATOR";
  const me = l.case.authors.find((a) => a.userId === viewer.id) ?? null;
  const visible = isOperator
    ? (l.state === "FINAL" || (!!l.case.enteredById && l.kind === "SUBMISSION"))
    : !!me && (l.state === "FINAL" || l.createdById === viewer.id || l.kind === "SUBMISSION");
  if (!visible) throw new HttpError(404, "Nie znaleziono");
  return { letter: l, isOperator, me };
}
