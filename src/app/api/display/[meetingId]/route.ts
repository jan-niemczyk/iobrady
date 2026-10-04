import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { comparePl } from "@/lib/sortPl";
import { resolveBoardLogo } from "@/lib/board";
import { secretTallyHidden } from "@/lib/secretTally";
import { canViewDisplay, presentedDisplayToken } from "@/lib/displayAccess";
import { getDisplayCache, setDisplayCache } from "@/lib/displayCache";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";

export const dynamic = "force-dynamic";

/**
 * Endpoint widoku prezentacyjnego (ekrany świetlne, nakładka OBS).
 * Dostęp: token ekranu (Meeting.displayToken) albo sesja operatora / uczestnika posiedzenia (SA-07).
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
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await ctx.params;
  // Limit per IP - ekrany odpytują co 1,5 s (ok. 40/min); 900/min wystarcza na wiele ekranów
  // i podglądów za jednym publicznym IP sali.
  if (!rateLimit(`display:${clientIp(req.headers)}`, 900, 60_000))
    return new NextResponse("Zbyt wiele żądań", { status: 429, headers: { ...NO_STORE, "Retry-After": "10" } });
  // SA-07: token ekranu (link / ciasteczko) albo sesja operatora / uczestnika posiedzenia.
  const token = presentedDisplayToken(new URL(req.url), req.headers.get("cookie"), meetingId);
  if (!(await canViewDisplay(meetingId, token))) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  const cached = getDisplayCache(meetingId);
  if (cached) return new NextResponse(cached, { headers: { "Content-Type": "application/json", ...NO_STORE } });
  const body = await buildDisplayPayload(meetingId);
  if (!body) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  const json = JSON.stringify(body);
  setDisplayCache(meetingId, json);
  return new NextResponse(json, { headers: { "Content-Type": "application/json", ...NO_STORE } });
}

async function buildDisplayPayload(meetingId: string) {
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
  if (!m) return null;

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

  // Wyniki pakietu per pozycja. Jawne w trakcie - z bieżących ballotów (głosowanie jawne jest jawne),
  // po zamknięciu - snapshoty result*. Tajne: rozkład dopiero po ZAMKNIĘCIU (SA-01) - wcześniej
  // (otwarte, przerwane, anulowane) same zera, bez względu na tryb kotarkowy.
  const packageLiveResults = async (voteId: string, isSecret: boolean, status: string) => {
    const opts = await prisma.voteOption.findMany({ where: { voteId }, orderBy: { order: "asc" } });
    if (isSecret || status !== "OPEN") {
      const hidden = secretTallyHidden({ visibility: isSecret ? "SECRET" : "OPEN", status });
      return opts.map((o) => ({
        id: o.id, label: o.label, positionNumber: o.positionNumber, description: o.description,
        yes: hidden ? 0 : (o.resultYes ?? o.secretYes),
        no: hidden ? 0 : (o.resultNo ?? o.secretNo),
        abstain: hidden ? 0 : (o.resultAbstain ?? o.secretAbstain),
        passed: hidden ? null : (o.resultPassed ?? null),
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
    // Wyniki ZA/PRZECIW/WSTRZ: snapshot result* (ustawiany przy zamknięciu). Jawne w trakcie
    // pokazują wyniki z ballotów po stronie klienta. Tajne: rozkład dopiero po zamknięciu (SA-01).
    const hidden = secretTallyHidden(v);
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
      resultYes: hidden ? 0 : (v.resultYes ?? 0),
      resultNo: hidden ? 0 : (v.resultNo ?? 0),
      resultAbstain: hidden ? 0 : (v.resultAbstain ?? 0),
      resultCastCount: cast,
      resultPassed: hidden ? null : ((v as { resultPassed: boolean | null }).resultPassed ?? null),
      majorityKind: v.majorityKind,
      majorityBase: v.majorityBase,
      majorityThreshold: computeThreshold(v.majorityKind, v.majorityBase, eligible, present, cast),
      options: "options" in v
        ? (v.options as { label: string; resultCount: number | null }[]).map((o) => ({
            label: o.label, count: hidden ? 0 : (o.resultCount ?? 0),
          }))
        : [],
      // Pakiet: wyniki per pozycja (za/przeciw/wstrzym) - na żywo lub snapshot.
      packagePositions: v.type === "PACKAGE" ? (packageResultsMap.get(v.id) ?? []) : undefined,
      requireAllPositions: v.requireAllPositions,
    };
  };

  return {
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
    // Plansza reprezentacyjna: widoczność per posiedzenie, treść z ustawień organizacji.
    // Kolor = kolor nagłówka prezentacji. Transmisja (overlay) tego pola nie używa.
    board: {
      visible: m.displayBoardVisible,
      backgroundUrl: settings?.boardBackgroundUrl?.startsWith("/api/uploads/") ? settings.boardBackgroundUrl : null,
      logoUrl: resolveBoardLogo(
        settings?.boardLogoMode,
        settings?.presentationLogoUrl ?? null,
        settings?.boardLogoUrl?.startsWith("/api/uploads/") ? settings.boardLogoUrl : null,
      ),
      text: settings?.boardText ?? settings?.organizationName ?? "",
      overlayOpacity: settings?.boardOverlayOpacity ?? 80,
      // Własny kolor planszy; null = kolor nagłówka prezentacji.
      color: settings?.boardColor ?? null,
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
    // W trakcie sprawdzenia obecności licznik "obecnych" liczymy z migawki (tak jak lista imienna),
    // a nie z poprzedniego stanu obecności - inaczej kafelki i lista pokazywały różne liczby.
    counts: { eligible: eligibleCount, present: checkPresence ? voters.filter((v) => v.present).length : presentCount },
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
      select: { id: true, number: true, title: true, status: true, isSubItem: true, unnumbered: true, presenter: true, committee: true },
    })).map((a) => ({ id: a.id, number: a.number, title: a.title, status: a.status, isSubItem: a.isSubItem, unnumbered: a.unnumbered, presenter: a.presenter, committee: a.committee ?? null })),
    // Aktualny punkt - używany w AUTO
    currentAgendaItem: m.currentAgendaItem
      ? { id: m.currentAgendaItem.id, number: m.currentAgendaItem.number, title: m.currentAgendaItem.title, unnumbered: m.currentAgendaItem.unnumbered }
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
  };
}
