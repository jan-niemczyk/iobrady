/**
 * Wspólny system komunikatów aplikacji - zamiast natywnych alert()/confirm()/prompt().
 *
 *   notify.success("Zmiany zapisano.")            - dymek (toast), znika sam
 *   notify.error("Ta osoba jest już zapisana.")   - dymek błędu
 *   await notifyFailure(response)                 - błąd z odpowiedzi API / wyjątku: komunikat
 *                                                   użytkowy albo ogólny (szczegół tylko w konsoli)
 *   if (await ask({ title, message, confirmLabel, danger: true })) { ... }  - okno potwierdzenia
 *
 * Stan trzyma mały magazyn w module; wyświetla go jeden <FeedbackHost /> montowany w layoucie
 * (operator: wariant Bootstrap, radny/kreator: wariant aplikacji). Dzięki temu API działa także
 * poza komponentami (np. w funkcjach pobierających raporty).
 */

export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
  /** ms do automatycznego zamknięcia; null = do zamknięcia ręcznego */
  timeout: number | null;
}

export interface ConfirmOptions {
  title: string;
  /** Treść; znaki nowej linii są zachowane. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Operacja destrukcyjna - czerwony przycisk, fokus startowo na "Anuluj". */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

interface FeedbackState {
  toasts: ToastMessage[];
  confirm: PendingConfirm | null;
}

let state: FeedbackState = { toasts: [], confirm: null };
const queue: PendingConfirm[] = [];
const listeners = new Set<() => void>();
let seq = 0;
let hostCount = 0;

function emit(next: FeedbackState) {
  state = next;
  for (const l of listeners) l();
}

export function subscribeFeedback(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getFeedbackState(): FeedbackState { return state; }
const EMPTY: FeedbackState = { toasts: [], confirm: null };
export function getServerFeedbackState(): FeedbackState { return EMPTY; }

/** Host zgłasza swoją obecność - bez hosta komunikat trafia przynajmniej do konsoli. */
export function registerFeedbackHost(): () => void {
  hostCount++;
  return () => { hostCount--; };
}

const DEFAULT_TIMEOUT: Record<ToastTone, number> = { success: 4000, info: 5000, warning: 7000, error: 8000 };

function push(tone: ToastTone, title: string, detail?: string, timeout?: number | null): number {
  const id = ++seq;
  if (hostCount === 0 && typeof console !== "undefined") console.warn(`[komunikat:${tone}] ${title}${detail ? ` - ${detail}` : ""}`);
  emit({ ...state, toasts: [...state.toasts, { id, tone, title, detail, timeout: timeout === undefined ? DEFAULT_TIMEOUT[tone] : timeout }].slice(-5) });
  return id;
}

export function dismissToast(id: number) {
  emit({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });
}

export const notify = {
  success: (title: string, detail?: string) => push("success", title, detail),
  info: (title: string, detail?: string) => push("info", title, detail),
  warning: (title: string, detail?: string) => push("warning", title, detail),
  error: (title: string, detail?: string) => push("error", title, detail),
};

/** Okno potwierdzenia (zamiast confirm()). Zwraca true po zatwierdzeniu, false po anulowaniu. */
export function ask(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (hostCount === 0) {
      console.error("[potwierdzenie] brak FeedbackHost - operacja anulowana:", opts.title);
      resolve(false);
      return;
    }
    const item: PendingConfirm = { ...opts, id: ++seq, resolve };
    if (state.confirm) queue.push(item);
    else emit({ ...state, confirm: item });
  });
}

/** Wywoływane przez host po kliknięciu przycisku okna potwierdzenia. */
export function settleConfirm(ok: boolean) {
  const cur = state.confirm;
  if (!cur) return;
  const next = queue.shift() ?? null;
  emit({ ...state, confirm: next });
  cur.resolve(ok);
}

// ─── Błędy: użytkowe vs techniczne ───────────────────────────────────────────

export const TECHNICAL_ERROR = "Nie udało się wykonać operacji. Spróbuj ponownie.";

const GENERIC_BY_STATUS: Record<number, string> = {
  400: "Nie można wykonać tej operacji - sprawdź wprowadzone dane.",
  401: "Sesja wygasła. Zaloguj się ponownie.",
  403: "Nie masz uprawnień do tej operacji.",
  404: "Nie znaleziono elementu - mógł zostać usunięty. Odśwież stronę.",
  409: "Nie można wykonać tej operacji w aktualnym stanie.",
  413: "Plik jest za duży.",
  415: "Nieobsługiwany typ pliku.",
};

// Tekst wyglądający na techniczny (komunikaty frameworka, wyjątki, JSON, HTML, ślady stosu).
const TECHNICAL_TEXT = /^(bad request|unauthori[sz]ed|forbidden|not found|bad:|invalid|error|internal|method not allowed|prisma|typeerror|referenceerror|syntaxerror)\b|\n\s+at\s|\bat [\w$.<>]+ \(|stack|<\/?(html|body|head)|<!doctype|\bP20\d\d\b|unique constraint|invalid `prisma|zoderror|^\s*[[{]/i;

/**
 * Komunikat do pokazania użytkownikowi na podstawie statusu i treści odpowiedzi API.
 * Treść z serwera pokazujemy tylko wtedy, gdy jest zwykłym zdaniem dla użytkownika (po polsku,
 * bez technicznych szczegółów); w przeciwnym razie ogólny komunikat wg statusu.
 */
export function userErrorMessage(status: number, text: string | null | undefined): string {
  if (status >= 500 || status === 0) return TECHNICAL_ERROR;
  const t = (text ?? "").trim();
  const generic = GENERIC_BY_STATUS[status] ?? TECHNICAL_ERROR;
  if (!t || t.length > 300) return generic;
  if (TECHNICAL_TEXT.test(t)) return generic;
  // Krótkie komunikaty wyłącznie po angielsku (np. "Meeting not found") - ogólny tekst.
  if (!/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(t) && /^[A-Za-z0-9 _:.,'"()/-]+$/.test(t) && /\b(the|not|is|no|found|required|missing|failed|cannot|only)\b/i.test(t)) return generic;
  return t;
}

/**
 * Komunikat błędu do pola w formularzu (zamiast surowego `await r.text()`): treść użytkowa
 * z serwera albo komunikat ogólny; szczegół techniczny tylko w konsoli.
 */
export async function readUserError(r: Response, fallback?: string): Promise<string> {
  let text = "";
  try { text = await r.text(); } catch { /* treść niedostępna */ }
  const msg = userErrorMessage(r.status, text);
  if (msg === TECHNICAL_ERROR || msg === GENERIC_BY_STATUS[r.status]) console.error(`[błąd API] ${r.status} ${r.url}`, text);
  return msg === TECHNICAL_ERROR && fallback ? fallback : msg;
}

/**
 * Pokazuje błąd operacji: dla odpowiedzi API - komunikat użytkowy albo ogólny; dla wyjątku
 * (np. brak sieci) - komunikat ogólny. Szczegół techniczny trafia wyłącznie do konsoli.
 */
export async function notifyFailure(input: Response | unknown, fallback?: string): Promise<void> {
  if (typeof Response !== "undefined" && input instanceof Response) {
    let text = "";
    try { text = await input.text(); } catch { /* treść niedostępna */ }
    const msg = userErrorMessage(input.status, text);
    if (msg === TECHNICAL_ERROR || msg === GENERIC_BY_STATUS[input.status]) {
      console.error(`[błąd API] ${input.status} ${input.url}`, text);
    }
    notify.error(msg === TECHNICAL_ERROR && fallback ? fallback : msg);
    return;
  }
  console.error("[błąd operacji]", input);
  notify.error(fallback ?? TECHNICAL_ERROR);
}
