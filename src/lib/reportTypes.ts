// Typy danych raportu głosowania - współdzielone przez server (budowanie) i client (PDF).
export type ReportMark = "za" | "pr." | "ws." | "ng." | "ob." | "nb." | "nieob." | "wykl.";

export interface ReportPerson {
  lastName: string;
  firstName: string;
  /** Stały numer porządkowy osoby (rozstrzyga kolejność przy identycznym imieniu i nazwisku). */
  seq?: number;
  present?: boolean;
  mark?: ReportMark;
  perCandidate?: ReportMark[];
  perPosition?: ReportMark[];
}

export interface ReportGroup {
  shortName: string;
  membersCount: number;
  participated: number;
  yes?: number;
  no?: number;
  abstain?: number;
  notVoted: number;
  absent: number;
  people: ReportPerson[];
}

export interface ReportData {
  /** Identyfikator głosowania (link do szczegółów). */
  voteId?: string;
  /** Punkt porządku obrad - osobno od przedmiotu głosowania. */
  itemNumber?: string | null;
  itemTitle?: string | null;
  /** Rozstrzygnięcie zapisane przy zamknięciu (null - brak, np. lista/pakiet: przy pozycjach). */
  decision?: { label: string; positive: boolean } | null;
  /** Liczba oddanych głosów i obecnych uprawnionych w chwili otwarcia (migawka). */
  castCount?: number;
  presentAtOpen?: number | null;
  organizationName?: string;
  meetingTitle: string;
  meetingNumber: string;
  voteNumber: number | string;
  timestamp: string;
  contextLabel: string;
  voteTitle: string;
  description?: string;
  summaryLine: string;
  summaryParts?: string[];
  majorityPart?: string;
  isList: boolean;
  isQuorum: boolean;
  isSecret: boolean;
  isPackage?: boolean;
  excludedList?: { lastName: string; firstName: string; groupShort?: string | null }[];
  /** Pakiet: pozycje z wynikami per pozycja (za/przeciw/wstrzym). */
  packagePositions?: { positionNumber: string; label: string; yes: number; no: number; abstain: number; glosowalo: number }[];
  requireAllPositions?: boolean;
  candidatesCount?: number;
  /** Lista: liczba osób głosujących, które były przeciw WSZYSTKIM kandydaturom (nie wskazały nikogo). */
  againstAllCount?: number;
  candidates?: string[];
  candidatesSummary?: { label: string; yesCount: number }[];
  groups?: ReportGroup[];
  groupsEnabled?: boolean;
  noSupport?: number;
}
