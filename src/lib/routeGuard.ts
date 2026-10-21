import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/booth";
import { serverError } from "@/lib/http";

/**
 * Wspólna obsługa błędów trasy: HttpError -> jego status i komunikat, naruszenie unikalności
 * (np. równoczesna rejestracja z tym samym numerem) -> 409, reszta -> 500 bez szczegółów.
 */
export async function guarded(where: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "Taki numer albo wpis już istnieje." }, { status: 409 });
    return serverError(where, e);
  }
}
