import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { comparePl } from "@/lib/sortPl";

export const dynamic = "force-dynamic";

/**
 * Publiczny endpoint dla widoku prezentacyjnego (ekrany świetlne).
 * Nie wymaga autoryzacji - sala publiczna.
 *
 * Respektuje `Meeting.displayMode`:
 *  - AUTO            → automatyczne wybranie stanu na podstawie aktualnego głosowania/punktu
 *  - DEFAULT         → ekran domyślny (nazwa posiedzenia)
 *  - PINNED_AGENDA   → konkretny punkt agendy
 *  - PINNED_VOTE     → wyniki konkretnego głosowania
 *  - MESSAGE         → komunikat tekstowy operatora
 *  - SPEAKER_LIST    → lista mówców aktualnego punktu
 *  - BLANK           → pusty ekran
 *
 * Nigdy nie zwraca: imiennej listy głosów dla tajnych, ballotów indywidualnych.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await ctx.params;
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      currentAgendaItem: true,
      messages: { where: { hiddenAt: null }, orderBy: { publishedAt: "desc" }, take: 3 },
      votes: {
        orderBy: { openedAt: "desc" },
        take: 10,
        include: {
          options: { orderBy: { order: "asc" } },
          // Liczba oddanych głosów w trakcie - aktualizuje się na żywo (resultCastCount jest snapshotem przy zamknięciu)
          _count: { select: { ballots: true, secretMarkers: true } },
        },
      },
      speakerLists: {
        include: {
          entries: {
            include: { user: { include: { group: true } } },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
  if (!m) return new NextResponse("Not found", { status: 404 });

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const groupsEnabled = settings?.groupsEnabled !== false;

  // Liczba uprawnionych / obecnych - plus voters listy do imiennych wyników i listy obecności
  const participants = await prisma.meetingParticipant.findMany({
    where: { meetingId, hasVotingRight: true },
    include: { attendance: true, user: { include: { group: true } } },
  });
  const eligibleCount = participants.length;
  const presentCount = participants.filter((p) => p.attendance?.status === "PRESENT").length;

  // Sortujemy po polsku w JS - Postgres bez polskiego collation umieszcza Ł, Ó itd.
  // za literą Z (kolejność bajtowa). comparePl daje poprawną kolejność alfabetyczną.
  const sortedParticipants = [...participants].sort((a, b) => {
    const byLast = comparePl(a.user.lastName, b.user.lastName);
    return byLast !== 0 ? byLast : comparePl(a.user.firstName, b.user.firstName);
  });

  // Gdy trwa sprawdzenie obecności, stan „present" bierzemy z migawki (nie z bieżącej Attendance),
  // bo bieżąca lista jest nadpisywana dopiero przy zamknięciu sprawdzenia.
  let checkPresence: Map<string, boolean> | null = null;
  let attendanceCheckOpen = false;
  if (m.activeAttendanceCheckId) {
    const chk = await prisma.attendanceCheck.findUnique({
      where: { id: m.activeAttendanceCheckId },
      select: { kind: true, status: true, entries: { select: { userId: true, present: true } } },
    });
    if (chk && chk.status === "OPEN") {
      checkPresence = new Map(chk.entries.map((e) => [e.userId, e.present]));
      // Kworum ma własny widok głosowania; zwykłe sprawdzenie (CONFIRMATION) -> ekran listy obecności w AUTO.
      attendanceCheckOpen = chk.kind === "CONFIRMATION";
    }
  }

  const voters = sortedParticipants.map((p) => ({
    id: p.userId,
    name: `${p.user.lastName} ${p.user.firstName}`,
    present: checkPresence ? (checkPresence.get(p.userId) ?? false) : (p.attendance?.status === "PRESENT"),
    groupShort: groupsEnabled ? (p.user.group?.shortName ?? null) : null,
    excluded: p.excludedFromMeeting,
  }));

  const activeVote = m.votes.find((v) => v.status === "OPEN") ?? null;
  // Ostatnie zamknięte, ale tylko jeśli operator nie zdjął go z auto.
  const dismissedSet = new Set(m.displayDismissedVoteIds);
  const lastClosed = m.votes.find((v) => v.status === "CLOSED" && !dismissedSet.has(v.id)) ?? null;

  // Wpięty (PINNED) punkt agendy
  const pinnedAgendaItem = m.displayPinnedAgendaItemId
    ? await prisma.agendaItem.findUnique({ where: { id: m.displayPinnedAgendaItemId } })
    : null;

  // Wpięte (PINNED) głosowanie
  const pinnedVote = m.displayPinnedVoteId
    ? await prisma.vote.findUnique({
        where: { id: m.displayPinnedVoteId },
        include: {
          options: { orderBy: { order: "asc" } },
          _count: { select: { ballots: true, secretMarkers: true } },
        },
      })
    : null;

  // Imienne ballots (tylko dla głosowań JAWNYCH, gdy operator włączył opcję displayShowByName)
  // - operator wyłącza/włącza checkboxem w panelu sterowania.
  // Dla SECRET ZAWSZE ukryte (nie wolno ujawnić).
  let liveBallots: { userId: string; userName: string; choice: string | null }[] | undefined;
  // Lista nazwisk do TABLICY - domyślnie bieżąca, ale dla wyświetlanego głosowania
  // nadpisujemy ją migawką składu z chwili otwarcia (roster), żeby stare głosowania
  // pokazywały skład sprzed dodania nowych uczestników. Kluby z migawki.
  let boardVoters = voters;
  const targetVote = activeVote ?? pinnedVote ?? lastClosed;
  if (targetVote) {
    const roster = await prisma.voteRoster.findMany({
      where: { voteId: targetVote.id },
      orderBy: { order: "asc" },
    });
    if (roster.length > 0) {
      boardVoters = roster.map((r) => ({
        id: r.userId ?? r.id,
        name: `${r.lastName} ${r.firstName}`,
        present: r.present,
        groupShort: groupsEnabled ? (r.clubShort ?? null) : null,
        excluded: false,
      }));
    }
  }
  if (m.displayShowByName) {
    if (targetVote && targetVote.visibility !== "SECRET") {
      const ballots = await prisma.ballot.findMany({
        where: { voteId: targetVote.id },
        select: { userId: true, choice: true },
      });
      const nameByUser = new Map(boardVoters.map((v) => [v.id, v.name]));
      liveBallots = ballots
        .filter((b) => b.userId != null && nameByUser.has(b.userId))
        .map((b) => ({
          userId: b.userId as string,
          userName: nameByUser.get(b.userId as string) ?? "",
          choice: b.choice as string | null,
        }));
    }
  }

  // Lista mówców aktywnego punktu
  const activeSpeakerList = m.currentAgendaItemId
    ? m.speakerLists.find((sl) => sl.agendaItemId === m.currentAgendaItemId)
    : null;

  const computeThreshold = (kind: string, base: string, eligible: number, present: number, cast: number): number | null => {
    // Baza
    const N = base === "OF_FULL_BODY" ? eligible
      : base === "OF_PRESENT" ? present
      : cast; // OF_VOTERS (głosujący)
    if (N <= 0) return null;
    switch (kind) {
      case "SIMPLE": return null; // zwykła: ZA > PRZECIW; nie ma stałego progu liczbowego
      case "ABSOLUTE": return Math.floor(N / 2) + 1; // pierwsza liczba całkowita >= N/2 + 1
      case "QUALIFIED_TWO_THIRDS": return Math.ceil((2 * N) / 3);
      case "QUALIFIED_THREE_FIFTHS": return Math.ceil((3 * N) / 5);
      default: return null;
    }
  };

  // Wyniki pakietu per pozycja NA ŻYWO. Jawne - z bieżących ballotów (podgląd u operatora),
  // tajne - z anonimowych liczników secret* per pozycja. Po zamknięciu - snapshoty result*.
  const packageLiveResults = async (voteId: string, isSecret: boolean, status: string) => {
    const opts = await prisma.voteOption.findMany({ where: { voteId }, orderBy: { order: "asc" } });
    if (isSecret || status !== "OPEN") {
      return opts.map((o) => ({
        id: o.id, label: o.label, positionNumber: o.positionNumber, description: o.description,
        yes: status === "OPEN" ? o.secretYes : (o.resultYes ?? o.secretYes),
        no: status === "OPEN" ? o.secretNo : (o.resultNo ?? o.secretNo),
        abstain: status === "OPEN" ? o.secretAbstain : (o.resultAbstain ?? o.secretAbstain),
        passed: o.resultPassed ?? null,
      }));
    }
    // Jawne na żywo: zlicz z selections.
    const sels = await prisma.ballotSelection.findMany({
      where: { ballot: { voteId }, optionId: { in: opts.map((o) => o.id) } },
      select: { optionId: true, choice: true },
    });
    const agg = new Map<string, { yes: number; no: number; abstain: number }>();
    for (const o of opts) agg.set(o.id, { yes: 0, no: 0, abstain: 0 });
    for (const s of sels) {
      const a = agg.get(s.optionId); if (!a || !s.choice) continue;
      if (s.choice === "YES") a.yes++; else if (s.choice === "NO") a.no++; else a.abstain++;
    }
    return opts.map((o) => ({
      id: o.id, label: o.label, positionNumber: o.positionNumber, description: o.description,
      ...(agg.get(o.id) ?? { yes: 0, no: 0, abstain: 0 }), passed: o.resultPassed ?? null,
    }));
  };

  // Prekalkulacja pakietowych wyników dla widocznych głosowań (na żywo).
  const packageResultsMap = new Map<string, Awaited<ReturnType<typeof packageLiveResults>>>();
  for (const v of [activeVote, lastClosed, pinnedVote]) {
    if (v && v.type === "PACKAGE") {
      packageResultsMap.set(v.id, await packageLiveResults(v.id, v.visibility === "SECRET", v.status));
    }
  }

  const voteResponse = (v: NonNullable<typeof pinnedVote | typeof activeVote | typeof lastClosed>) => {
    const eligible = v.resultEligibleCount ?? eligibleCount;
    const present = v.resultPresentCount ?? presentCount;
    const isSecret = v.visibility === "SECRET";
    const counts = (v as { _count?: { ballots: number; secretMarkers: number } })._count;
    // Liczba oddanych na żywo: tajne → markery, jawne → ballots. Po zamknięciu → snapshot.
    const liveCast = isSecret ? (counts?.secretMarkers ?? 0) : (counts?.ballots ?? 0);
    const cast = v.status === "OPEN" ? liveCast : (v.resultCastCount ?? 0);
    // Wyniki ZA/PRZECIW/WSTRZ: dla tajnych w trakcie bierzemy liczniki secret* na żywo;
    // po zamknięciu i dla jawnych - snapshot result*.
    const secretLive = isSecret && v.status === "OPEN";
    const vv = v as { secretYes?: number; secretNo?: number; secretAbstain?: number };
    return {
      id: v.id,
      number: v.number,
      title: v.title,
      description: (v as { description: string | null }).description ?? null,
      type: v.type,
      visibility: v.visibility,
      status: v.status,
      eligibleCount: eligible,
      presentCount: present,
      resultYes: secretLive ? (vv.secretYes ?? 0) : (v.resultYes ?? 0),
      resultNo: secretLive ? (vv.secretNo ?? 0) : (v.resultNo ?? 0),
      resultAbstain: secretLive ? (vv.secretAbstain ?? 0) : (v.resultAbstain ?? 0),
      resultCastCount: cast,
      resultPassed: (v as { resultPassed: boolean | null }).resultPassed ?? null,
      majorityKind: v.majorityKind,
      majorityBase: v.majorityBase,
      majorityThreshold: computeThreshold(v.majorityKind, v.majorityBase, eligible, present, cast),
      options: "options" in v
        ? (v.options as { label: string; resultCount: number | null }[]).map((o) => ({
            label: o.label, count: o.resultCount ?? 0,
          }))
        : [],
      // Pakiet: wyniki per pozycja (za/przeciw/wstrzym) - na żywo lub snapshot.
      packagePositions: v.type === "PACKAGE" ? (packageResultsMap.get(v.id) ?? []) : undefined,
      requireAllPositions: v.requireAllPositions,
    };
  };

  return NextResponse.json({
    meeting: {
      id: m.id,
      name: m.name,
      displayNameOverride: m.displayNameOverride ?? null,
      number: m.number,
      scheduledAt: m.scheduledAt.toISOString(),
      status: m.status,
      agendaAutoMode: m.agendaAutoDisplayMode,
      autoOpenSpeakerList: m.autoOpenSpeakerList,
    },
    organization: settings?.organizationName ?? "Organizacja",
    presentation: {
      font: settings?.presentationFont ?? "Inter",
      headerColor: settings?.presentationHeaderColor ?? "#0B2A4A",
      logoUrl: settings?.presentationLogoUrl ?? null,
      overtimeSound: settings?.speechOvertimeSound ?? false,
    },
    overlay: {
      font: settings?.overlayFont ?? "Inter",
      resultsMode: settings?.overlayResultsMode ?? "BARS",
      boardTiming: settings?.overlayBoardTiming ?? "AFTER_CLOSE",
      showSpeechClock: settings?.overlayShowSpeechClock ?? true,
    },
    barColors: {
      item: settings?.colorItemBar ?? "#0E7490",
      speaker: settings?.colorSpeakerBar ?? "#7C3AED",
      vote: settings?.colorVoteBar ?? "#E11D48",
      session: settings?.colorSessionBar ?? "#1E3A8A",
    },
    counts: { eligible: eligibleCount, present: presentCount },
    attendanceCheckOpen,
    // Stan sterowania
    display: {
      mode: m.displayMode,
      customMessage: m.displayCustomMessage,
      breakUntil: m.breakUntil?.toISOString() ?? null,
      messageOnOverlay: m.displayMessageOnOverlay,
      messageObsStyle: m.displayMessageObsStyle,
      showCastCount: m.displayShowCastCount,
      showByName: m.displayShowByName,
      summaryAfterClose: m.displaySummaryAfterClose,
      showIndividualVotes: m.displayShowIndividualVotes,
      candidatePage: m.displayCandidatePage,
      candidateSort: m.displayCandidateSort,
    },
    // Tryb „pokaż PIN" (tylko prezentacja, nigdy transmisja) - duży PIN + podsuma potwierdzeń.
    pinDisplay: await (async () => {
      if (!m.displayPinVoteId) return null;
      const pv = await prisma.vote.findUnique({
        where: { id: m.displayPinVoteId },
        select: { id: true, pinCode: true, pinRequired: true, status: true, resultPresentCount: true, _count: { select: { ballots: true, secretMarkers: true, pinAuths: true } } },
      });
      if (!pv || !pv.pinRequired || !pv.pinCode) return null;
      const present = pv.resultPresentCount ?? presentCount;
      const authorized = pv._count.pinAuths;
      const voted = pv._count.ballots + pv._count.secretMarkers;
      return { pin: pv.pinCode, present, authorized, voted };
    })(),
    // Pełna agenda (do widoku listy porządku obrad)
    agenda: (await prisma.agendaItem.findMany({
      where: { meetingId, hiddenFromDisplay: false },
      orderBy: { order: "asc" },
      select: { number: true, title: true, status: true, isSubItem: true, unnumbered: true, presenter: true, committee: true },
    })).map((a) => ({ number: a.number, title: a.title, status: a.status, isSubItem: a.isSubItem, unnumbered: a.unnumbered, presenter: a.presenter, committee: a.committee ?? null })),
    // Aktualny punkt - używany w AUTO
    currentAgendaItem: m.currentAgendaItem
      ? { number: m.currentAgendaItem.number, title: m.currentAgendaItem.title, unnumbered: m.currentAgendaItem.unnumbered }
      : null,
    // Wpięty punkt - używany w PINNED_AGENDA
    pinnedAgendaItem: pinnedAgendaItem
      ? { number: pinnedAgendaItem.number, title: pinnedAgendaItem.title, unnumbered: pinnedAgendaItem.unnumbered }
      : null,
    // Aktywne / ostatnie / wpięte głosowania
    activeVote: activeVote ? voteResponse(activeVote) : null,
    lastClosedVote: lastClosed ? voteResponse(lastClosed) : null,
    pinnedVote: pinnedVote ? voteResponse(pinnedVote) : null,
    // Lista mówców (dla SPEAKER_LIST i pomocniczo w AUTO)
    speakerList: activeSpeakerList
      ? {
          agendaItemNumber: m.currentAgendaItem?.number ?? null,
          agendaItemTitle: m.currentAgendaItem?.title ?? null,
          entries: activeSpeakerList.entries
            .filter((e) => e.status === "SPEAKING" || e.status === "WAITING")
            .map((e) => ({
              id: e.id,
              // Snapshot z chwili zgłoszenia (zamrożony); fallback do aktualnego user (stare wpisy)
              userName: e.speakerName
                ?? (e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"),
              // Skrót klubu pokazujemy tylko gdy włączona globalna obsługa klubów (punkt z listy)
              groupShort: groupsEnabled
                ? (e.speakerClubShort ?? e.user?.group?.shortName ?? null)
                : null,
              speakerRole: e.speakerRole ?? null,
              isGuest: e.guestId != null,
              entryType: e.entryType,
              priority: e.priority,
              status: e.status,
              startedAt: e.startedAt?.toISOString() ?? null,
              timeLimitSec: e.timeLimitSec,
              timeAdjustmentSec: e.timeAdjustmentSec,
            })),
        }
      : null,
    messages: m.messages.map((msg) => ({ id: msg.id, content: msg.content })),
    formalMotionsList: (() => {
      const q = m.speakerLists.find((sl) => sl.kind === "FORMAL_MOTIONS");
      if (!q) return null;
      const entries = q.entries
        .filter((e) => e.status === "SPEAKING" || e.status === "WAITING")
        .map((e) => ({
          id: e.id,
          userName: e.speakerName ?? (e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"),
          groupShort: groupsEnabled ? (e.speakerClubShort ?? e.user?.group?.shortName ?? null) : null,
          speakerRole: e.speakerRole ?? null,
          entryType: e.entryType,
          status: e.status,
          startedAt: e.startedAt?.toISOString() ?? null,
          timeLimitSec: e.timeLimitSec,
          timeAdjustmentSec: e.timeAdjustmentSec,
        }));
      return { entries };
    })(),
    // voters - dla imiennych wyników bierzemy listę tablicy (snapshot składu głosowania, z klubami);
    // dla listy obecności (gdy nie ma głosowania) to bieżący skład.
    voters: boardVoters,
    // imienne ballots (tylko gdy operator włączył displayShowByName i głosowanie jawne)
    liveBallots,
  });
}
