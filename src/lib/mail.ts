import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import nodemailer from "nodemailer";

export class MailNotConfiguredError extends Error {
  constructor() { super("Skonfiguruj SMTP w Ustawieniach, zanim wyślesz e-mail."); }
}

/**
 * Wysyła e-mail, budując transport NA ŻĄDANIE z bieżącej konfiguracji w Settings (działa od razu
 * po zmianie w UI, bez restartu aplikacji). Zawsze zapisuje EmailLog + audit "EMAIL_SENT",
 * niezależnie od wyniku (success/error).
 */
export async function sendMail(params: {
  to: string | string[];
  subject: string;
  html: string;
  kind: "welcome" | "password_reset" | "meeting_adhoc" | "public_link" | "custom";
  meetingId?: string;
  sentByUserId?: string;
}) {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const recipients = Array.isArray(params.to) ? params.to : [params.to];

  if (!settings?.smtpHost) {
    await logEmail({ ...params, recipients, success: false, error: "SMTP nieskonfigurowane" });
    throw new MailNotConfiguredError();
  }

  try {
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort ?? 587,
      secure: settings.smtpSecure,
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPassword ?? "" } : undefined,
    });
    await transport.sendMail({
      from: settings.smtpFrom || settings.smtpUser || undefined,
      to: recipients.join(", "),
      subject: params.subject,
      html: params.html,
    });
    await logEmail({ ...params, recipients, success: true });
  } catch (e) {
    await logEmail({ ...params, recipients, success: false, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

async function logEmail(params: {
  subject: string; kind: string; meetingId?: string; sentByUserId?: string;
  recipients: string[]; success: boolean; error?: string;
}) {
  await prisma.emailLog.create({
    data: {
      subject: params.subject, kind: params.kind, meetingId: params.meetingId,
      sentByUserId: params.sentByUserId, recipientCount: params.recipients.length,
      success: params.success, error: params.error,
    },
  });
  await audit({
    action: "EMAIL_SENT",
    description: `E-mail (${params.kind}) do ${params.recipients.length} odbiorców${params.success ? "" : " - BŁĄD"}`,
    meetingId: params.meetingId, userId: params.sentByUserId,
    metadata: { subject: params.subject, success: params.success, error: params.error },
  });
}
