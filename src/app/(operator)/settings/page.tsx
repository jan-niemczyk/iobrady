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
    <div className="px-6 py-8 max-w-[900px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-8">
        <div className="eyebrow mb-2">Konfiguracja</div>
        <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>Ustawienia globalne</h1>
        <p className="text-sm mt-3" style={{ color: "var(--color-ink-2)" }}>
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
      }} />

      <section className="mt-12 border-t border-[var(--color-rule)] pt-8">
        <div className="eyebrow mb-2">Konto</div>
        <h2 style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 16 }}>Zmiana hasła</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
