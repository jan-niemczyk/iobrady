import { prisma } from "@/lib/db";
import { SettingsForm } from "@/components/operator/SettingsForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  return (
    <div className="container py-4" style={{ maxWidth: 800 }}>
      <header className="border-bottom pb-3 mb-4">
        <div className="text-uppercase text-body-secondary small mb-1" style={{ letterSpacing: "0.06em" }}>Konfiguracja</div>
        <h1 className="mb-2" style={{ fontSize: 30 }}>Ustawienia globalne</h1>
        <p className="text-body-secondary small mb-0">
          Wartości domyślne stosowane przy tworzeniu nowych posiedzeń.
        </p>
      </header>
      <SettingsForm initial={{
        organizationName: s.organizationName,
        groupsEnabled: s.groupsEnabled,
        defaultQuorumRule: s.defaultQuorumRule,
        defaultQuorumValue: s.defaultQuorumValue,
        defaultMajorityKind: s.defaultMajorityKind,
        defaultMajorityBase: s.defaultMajorityBase,
        defaultAttendanceMode: s.defaultAttendanceMode,
        defaultVoteVisibility: s.defaultVoteVisibility,
        autoPublishResults: s.autoPublishResults,
        sessionTimeoutMinutes: s.sessionTimeoutMinutes,
        presentationFont: s.presentationFont,
        presentationHeaderColor: s.presentationHeaderColor,
        presentationLogoUrl: s.presentationLogoUrl,
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
        smtpPassword: s.smtpPassword,
        smtpFrom: s.smtpFrom,
      }} />

      <section className="mt-5 border-top pt-4">
        <div className="text-uppercase text-body-secondary small mb-1" style={{ letterSpacing: "0.06em" }}>Konto</div>
        <h2 className="mb-3" style={{ fontSize: 20 }}>Zmiana hasła</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
