import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MajorityKind, MajorityBase, QuorumRule, AttendanceMode, VoteVisibility } from "@prisma/client";
import { validationError } from "@/lib/http";
import { encryptSecret } from "@/lib/secretBox";
import { SMTP_PASSWORD_CONTEXT } from "@/lib/mail";
import { invalidateSettingsCache } from "@/lib/sessions";

const schema = z.object({
  organizationName: z.string().min(1).max(200).optional(),
  groupsEnabled: z.boolean().optional(),
  defaultQuorumRule: z.nativeEnum(QuorumRule).optional(),
  defaultQuorumValue: z.number().nullable().optional(),
  defaultMajorityKind: z.nativeEnum(MajorityKind).optional(),
  defaultMajorityBase: z.nativeEnum(MajorityBase).optional(),
  defaultAttendanceMode: z.nativeEnum(AttendanceMode).optional(),
  defaultVoteVisibility: z.nativeEnum(VoteVisibility).optional(),
  sessionIdleMinutes: z.number().int().min(0).max(480).optional(),
  logoutParticipantsOnMeetingClose: z.boolean().optional(),
  retentionAuditDays: z.number().int().min(30).max(36500).nullable().optional(),
  retentionLoginDays: z.number().int().min(30).max(36500).nullable().optional(),
  retentionEmailLogDays: z.number().int().min(30).max(36500).nullable().optional(),
  presentationFont: z.string().max(50).optional(),
  presentationHeaderColor: z.string().max(20).optional(),
  presentationLogoUrl: z.string().max(500).nullable().optional(),
  // Plansza reprezentacyjna (pliki - osobno przez /api/settings/board-image)
  boardLogoMode: z.enum(["ORG", "CUSTOM", "NONE"]).optional(),
  boardText: z.string().max(600).nullable().optional(),
  boardOverlayOpacity: z.number().int().min(0).max(100).optional(),
  boardColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Kolor planszy w formacie #RRGGBB").nullable().optional(),
  firstVoteFinalOpen: z.boolean().optional(),
  firstVoteFinalSecret: z.boolean().optional(),
  defaultSpeechLimitSec: z.number().int().min(0).max(36000).nullable().optional(),
  defaultAdVocemLimitSec: z.number().int().min(0).max(36000).nullable().optional(),
  defaultFormalMotionLimitSec: z.number().int().min(0).max(36000).nullable().optional(),
  autoAdHocOnFormalMotion: z.boolean().optional(),
  speechOvertimeSound: z.boolean().optional(),
  overlayFont: z.string().max(50).optional(),
  overlayResultsMode: z.enum(["BARS", "BOARD"]).optional(),
  overlayBoardTiming: z.enum(["FROM_START", "AFTER_CLOSE"]).optional(),
  overlayShowSpeechClock: z.boolean().optional(),
  defaultShowCastCount: z.boolean().optional(),
  defaultShowByName: z.boolean().optional(),
  defaultShowIndividualVotes: z.boolean().optional(),
  colorItemBar: z.string().max(20).optional(),
  colorSpeakerBar: z.string().max(20).optional(),
  colorVoteBar: z.string().max(20).optional(),
  colorSessionBar: z.string().max(20).optional(),
  defaultMaterialsVisibleToParticipants: z.boolean().optional(),
  defaultMaterialsPublic: z.boolean().optional(),
  smtpHost: z.string().max(200).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().max(200).nullable().optional(),
  // Hasło SMTP: niepuste = ustaw nowe (zapis zaszyfrowany), smtpPasswordClear = usuń, brak = bez zmian.
  smtpPassword: z.string().max(500).nullable().optional(),
  smtpPasswordClear: z.boolean().optional(),
  smtpFrom: z.string().max(200).nullable().optional(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { smtpPassword, smtpPasswordClear, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (smtpPasswordClear) data.smtpPassword = null;
  else if (smtpPassword) data.smtpPassword = encryptSecret(smtpPassword, SMTP_PASSWORD_CONTEXT);

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
  invalidateSettingsCache();

  await audit({
    action: "SETTINGS_CHANGED",
    description: "Zmieniono ustawienia globalne",
    userId: session.user.id,
    // Hasło SMTP nigdy w dzienniku - tylko informacja o zmianie.
    metadata: { changes: rest, smtpPassword: smtpPasswordClear ? "usunięte" : smtpPassword ? "zmienione" : undefined },
  });

  return NextResponse.json({ ok: true });
}
