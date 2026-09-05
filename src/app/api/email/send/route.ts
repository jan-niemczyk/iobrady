import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { meetingAdHocEmail } from "@/lib/mailTemplates";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  userIds: z.array(z.string()).min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

/** POST /api/email/send - dowolna wiadomość do wybranych użytkowników, niezwiązana z posiedzeniem. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });
  const d = parsed.data;

  const [settings, users] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.user.findMany({ where: { id: { in: d.userIds } }, select: { email: true } }),
  ]);
  if (users.length === 0) return new NextResponse("Brak odbiorców", { status: 400 });

  const { subject, html } = meetingAdHocEmail({
    orgName: settings?.organizationName ?? "iOBRADY",
    subject: d.subject, bodyText: d.body,
  });

  try {
    await sendMail({ to: users.map((u) => u.email), subject, html, kind: "custom", sentByUserId: session.user.id });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Błąd wysyłki", { status: 400 });
  }

  return NextResponse.json({ ok: true, count: users.length });
}
