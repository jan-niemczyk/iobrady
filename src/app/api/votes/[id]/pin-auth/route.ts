import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/),
});

/**
 * Radny wpisuje PIN, by odblokować przyciski głosowania.
 * Poprawny PIN tworzy VotePinAuth (autoryzacja tego użytkownika do tego głosowania).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Podaj 4-cyfrowy PIN.", { status: 400 });

  const vote = await prisma.vote.findUnique({
    where: { id },
    select: { id: true, status: true, pinRequired: true, pinCode: true },
  });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (!vote.pinRequired || !vote.pinCode)
    return NextResponse.json({ ok: true }); // PIN niewymagany - od razu autoryzowany
  if (vote.status !== "OPEN")
    return new NextResponse("Głosowanie nie jest otwarte.", { status: 400 });

  if (parsed.data.pin !== vote.pinCode)
    return new NextResponse("Nieprawidłowy PIN.", { status: 403 });

  await prisma.votePinAuth.upsert({
    where: { voteId_userId: { voteId: id, userId: session.user.id } },
    create: { voteId: id, userId: session.user.id },
    update: { authorizedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
