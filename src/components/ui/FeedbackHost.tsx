"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  dismissToast, getFeedbackState, getServerFeedbackState, registerFeedbackHost, settleConfirm, subscribeFeedback,
  type ToastMessage, type ToastTone,
} from "@/lib/feedback";
import { Modal } from "@/components/operator/Modal";

/**
 * Wyświetla komunikaty z `@/lib/feedback` (dymki + okno potwierdzenia). Montowany raz w layoucie.
 *  - variant="bootstrap": panel operatora (klasy Bootstrapa, okno na wspólnym <Modal>),
 *  - variant="app": aplikacja radnego i kreator (style aplikacji, przyciski pt-btn).
 * Dymki: prawy dolny róg (operator) / dół ekranu (radny) - stałe miejsce, nie blokują pracy.
 */
export function FeedbackHost({ variant }: { variant: "bootstrap" | "app" }) {
  const st = useSyncExternalStore(subscribeFeedback, getFeedbackState, getServerFeedbackState);
  useEffect(() => registerFeedbackHost(), []);

  return (
    <>
      {variant === "bootstrap" ? <BootstrapToasts toasts={st.toasts} /> : <AppToasts toasts={st.toasts} />}
      {st.confirm && (variant === "bootstrap"
        ? <BootstrapConfirm key={st.confirm.id} {...st.confirm} />
        : <AppConfirm key={st.confirm.id} {...st.confirm} />)}
    </>
  );
}

function useAutoDismiss(t: ToastMessage) {
  useEffect(() => {
    if (t.timeout == null) return;
    const h = setTimeout(() => dismissToast(t.id), t.timeout);
    return () => clearTimeout(h);
  }, [t.id, t.timeout]);
}

// ─── Operator (Bootstrap) ────────────────────────────────────────────────────

const BS_TONE: Record<ToastTone, { border: string; icon: string; label: string }> = {
  success: { border: "border-success", icon: "text-success", label: "Sukces" },
  info: { border: "border-primary", icon: "text-primary", label: "Informacja" },
  warning: { border: "border-warning", icon: "text-warning", label: "Uwaga" },
  error: { border: "border-danger", icon: "text-danger", label: "Błąd" },
};

function BootstrapToasts({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="toast-container position-fixed bottom-0 end-0 p-3 no-print" style={{ zIndex: 1100 }}>
      {toasts.map((t) => <BootstrapToast key={t.id} t={t} />)}
    </div>
  );
}

function BootstrapToast({ t }: { t: ToastMessage }) {
  useAutoDismiss(t);
  const tone = BS_TONE[t.tone];
  return (
    <div
      className={`toast show border-0 border-start border-4 ${tone.border} shadow`}
      role={t.tone === "error" ? "alert" : "status"}
      aria-live={t.tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div className="d-flex align-items-start gap-2 p-3">
        <div className="flex-grow-1 min-w-0">
          <div className="fw-semibold" style={{ overflowWrap: "anywhere" }}>
            <span className="visually-hidden">{tone.label}: </span>{t.title}
          </div>
          {t.detail && <div className="small text-body-secondary mt-1" style={{ whiteSpace: "pre-line" }}>{t.detail}</div>}
        </div>
        <button type="button" className="btn-close flex-shrink-0" aria-label="Zamknij komunikat" onClick={() => dismissToast(t.id)} />
      </div>
    </div>
  );
}

function BootstrapConfirm(c: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useConfirmFocus(c.danger ? cancelRef : okRef);
  useConfirmKeys(cancelRef, okRef);
  return (
    <Modal
      title={c.title}
      onClose={() => settleConfirm(false)}
      closeOnEscape={false}
      size="sm"
      zIndex={1080}
      footer={
        <>
          <button ref={cancelRef} type="button" className="btn" onClick={() => settleConfirm(false)}>{c.cancelLabel ?? "Anuluj"}</button>
          <button ref={okRef} type="button" className={`btn ${c.danger ? "btn-danger" : "btn-primary"}`} onClick={() => settleConfirm(true)}>
            {c.confirmLabel ?? "Potwierdź"}
          </button>
        </>
      }
    >
      {c.message && <p className="mb-0" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{c.message}</p>}
    </Modal>
  );
}

/**
 * Escape = Anuluj, Tab krąży po przyciskach okna. Nasłuch w fazie przechwytywania zatrzymuje
 * zdarzenie, więc Escape nie zamyka przy okazji okna, nad którym otwarto potwierdzenie.
 */
function useConfirmKeys(cancelRef: React.RefObject<HTMLButtonElement | null>, okRef: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); settleConfirm(false); return; }
      if (e.key === "Tab") {
        const items = [cancelRef.current, okRef.current].filter(Boolean) as HTMLElement[];
        const i = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault(); e.stopPropagation();
        items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [cancelRef, okRef]);
}

/** Fokus na wskazanym przycisku po otwarciu; po zamknięciu wraca do poprzednio aktywnego elementu. */
function useConfirmFocus(ref: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { if (prev && document.contains(prev)) prev.focus(); };
  }, [ref]);
}

// ─── Aplikacja radnego / kreator ─────────────────────────────────────────────

const APP_TONE: Record<ToastTone, { bar: string; bg: string }> = {
  success: { bar: "var(--color-yes)", bg: "var(--color-yes-bg)" },
  info: { bar: "var(--color-ink-2)", bg: "var(--color-paper)" },
  warning: { bar: "var(--color-abstain)", bg: "var(--color-abstain-bg)" },
  error: { bar: "var(--color-no)", bg: "var(--color-no-bg)" },
};

function AppToasts({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 16, zIndex: 210, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none", padding: "0 16px" }}>
      {toasts.map((t) => <AppToast key={t.id} t={t} />)}
    </div>
  );
}

function AppToast({ t }: { t: ToastMessage }) {
  useAutoDismiss(t);
  const c = APP_TONE[t.tone];
  return (
    <div
      role={t.tone === "error" ? "alert" : "status"}
      aria-live={t.tone === "error" ? "assertive" : "polite"}
      style={{
        pointerEvents: "auto", width: "100%", maxWidth: 460, background: c.bg, color: "var(--color-ink)",
        borderLeft: `5px solid ${c.bar}`, borderRadius: 10, padding: "12px 12px 12px 16px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.18)", display: "flex", gap: 12, alignItems: "flex-start",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, overflowWrap: "anywhere" }}>{t.title}</div>
        {t.detail && <div style={{ fontSize: 13, marginTop: 2, color: "var(--color-ink-2)", whiteSpace: "pre-line" }}>{t.detail}</div>}
      </div>
      <button
        type="button"
        aria-label="Zamknij komunikat"
        onClick={() => dismissToast(t.id)}
        style={{ background: "transparent", border: 0, color: "var(--color-ink-2)", fontSize: 20, lineHeight: 1, width: 32, height: 32, cursor: "pointer", flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  );
}

function AppConfirm(c: { id: number; title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useConfirmFocus(c.danger ? cancelRef : okRef);
  useConfirmKeys(cancelRef, okRef);
  const titleId = `cf-t-${c.id}`, msgId = `cf-m-${c.id}`;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) settleConfirm(false); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={c.message ? msgId : undefined}
        className="pt-panel"
        style={{ width: "100%", maxWidth: 440, background: "var(--color-paper)", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
      >
        <div className="pt-panel-body">
          <h2 id={titleId} style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{c.title}</h2>
          {c.message && <p id={msgId} style={{ margin: "10px 0 0", whiteSpace: "pre-line", color: "var(--color-ink-2)", overflowWrap: "anywhere" }}>{c.message}</p>}
          <div className="pt-btn-group" style={{ justifyContent: "flex-end", marginTop: 20 }}>
            <button ref={cancelRef} type="button" className="pt-btn" onClick={() => settleConfirm(false)}>{c.cancelLabel ?? "Anuluj"}</button>
            <button ref={okRef} type="button" className={`pt-btn ${c.danger ? "pt-btn-danger" : "pt-btn-primary"}`} onClick={() => settleConfirm(true)}>
              {c.confirmLabel ?? "Potwierdź"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
