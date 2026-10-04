import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { NextResponse } from "next/server";

/** POST /api/settings/test-email - wysyła testowy e-mail na adres bieżącego operatora. */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  if (!session.user.email) return new NextResponse("Brak adresu e-mail na koncie", { status: 400 });

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  try {
    await sendMail({
      to: session.user.email,
      subject: `${settings?.organizationName ?? "iOBRADY"} - testowy e-mail`,
      html: `<p>To jest testowa wiadomość z konfiguracji SMTP iOBRADY. Jeśli ją widzisz, konfiguracja działa poprawnie.</p>`,
      kind: "custom",
      sentByUserId: session.user.id,
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Błąd wysyłki", { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
