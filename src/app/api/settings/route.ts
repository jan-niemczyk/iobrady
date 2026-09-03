import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MajorityKind, MajorityBase, QuorumRule, AttendanceMode, VoteVisibility } from "@prisma/client";

const schema = z.object({
  organizationName: z.string().min(1).max(200).optional(),
  groupsEnabled: z.boolean().optional(),
  defaultQuorumRule: z.nativeEnum(QuorumRule).optional(),
  defaultQuorumValue: z.number().nullable().optional(),
  defaultMajorityKind: z.nativeEnum(MajorityKind).optional(),
  defaultMajorityBase: z.nativeEnum(MajorityBase).optional(),
  defaultAttendanceMode: z.nativeEnum(AttendanceMode).optional(),
  defaultVoteVisibility: z.nativeEnum(VoteVisibility).optional(),
  autoPublishResults: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  presentationFont: z.string().max(50).optional(),
  presentationHeaderColor: z.string().max(20).optional(),
  presentationLogoUrl: z.string().max(500).nullable().optional(),
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
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...parsed.data },
    update: parsed.data,
  });

  await audit({
    action: "SETTINGS_CHANGED",
    description: "Zmieniono ustawienia globalne",
    userId: session.user.id,
    metadata: { changes: parsed.data },
  });

  return NextResponse.json({ ok: true });
}
