import { prisma } from "@/lib/db";
import { SettingsForm } from "@/components/operator/SettingsForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { PageContainer, PageHeader } from "@/components/operator/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  return (
    <PageContainer size="md">
      <PageHeader
        kicker="Konfiguracja"
        title="Ustawienia globalne"
        description="Wartości domyślne stosowane przy tworzeniu nowych posiedzeń."
      />
      <SettingsForm initial={{
        organizationName: s.organizationName,
        groupsEnabled: s.groupsEnabled,
        defaultQuorumRule: s.defaultQuorumRule,
        defaultQuorumValue: s.defaultQuorumValue,
        defaultMajorityKind: s.defaultMajorityKind,
        defaultMajorityBase: s.defaultMajorityBase,
        defaultAttendanceMode: s.defaultAttendanceMode,
        defaultVoteVisibility: s.defaultVoteVisibility,
        sessionIdleMinutes: s.sessionIdleMinutes,
        logoutParticipantsOnMeetingClose: s.logoutParticipantsOnMeetingClose,
        retentionAuditDays: s.retentionAuditDays,
        retentionLoginDays: s.retentionLoginDays,
        retentionEmailLogDays: s.retentionEmailLogDays,
        presentationFont: s.presentationFont,
        presentationHeaderColor: s.presentationHeaderColor,
        presentationLogoUrl: s.presentationLogoUrl,
        boardBackgroundUrl: s.boardBackgroundUrl,
        boardLogoMode: s.boardLogoMode,
        boardLogoUrl: s.boardLogoUrl,
        boardText: s.boardText,
        boardOverlayOpacity: s.boardOverlayOpacity,
        boardColor: s.boardColor,
        firstVoteFinalOpen: s.firstVoteFinalOpen,
        firstVoteFinalSecret: s.firstVoteFinalSecret,
        defaultSpeechLimitSec: s.defaultSpeechLimitSec,
        defaultAdVocemLimitSec: s.defaultAdVocemLimitSec,
        defaultFormalMotionLimitSec: s.defaultFormalMotionLimitSec,
        autoAdHocOnFormalMotion: s.autoAdHocOnFormalMotion,
        speechOvertimeSound: s.speechOvertimeSound,
        overlayFont: s.overlayFont,
        overlayResultsMode: s.overlayResultsMode,
        overlayBoardTiming: s.overlayBoardTiming,
        overlayShowSpeechClock: s.overlayShowSpeechClock,
        defaultShowCastCount: s.defaultShowCastCount,
        defaultShowByName: s.defaultShowByName,
        defaultShowIndividualVotes: s.defaultShowIndividualVotes,
        colorItemBar: s.colorItemBar,
        colorSpeakerBar: s.colorSpeakerBar,
        colorVoteBar: s.colorVoteBar,
        colorSessionBar: s.colorSessionBar,
        defaultMaterialsVisibleToParticipants: s.defaultMaterialsVisibleToParticipants,
        defaultMaterialsPublic: s.defaultMaterialsPublic,
        smtpHost: s.smtpHost,
        smtpPort: s.smtpPort,
        smtpSecure: s.smtpSecure,
        smtpUser: s.smtpUser,
        smtpPasswordSet: !!s.smtpPassword,
        smtpFrom: s.smtpFrom,
      }} />

      <section className="card mt-4">
        <div className="card-header"><h2 className="card-title-text">Zmiana hasła</h2></div>
        <div className="card-body">
          <ChangePasswordForm />
        </div>
      </section>
    </PageContainer>
  );
}
