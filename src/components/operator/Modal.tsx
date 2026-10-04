"use client";

// Okno modalne w strukturze Bootstrapa 5.3 (modal / modal-dialog / modal-content), sterowane
// stanem Reacta. Nagłówek i stopka stoją w miejscu, przewija się tylko treść (modal-dialog-scrollable).
import { useEffect, type ReactNode } from "react";

export function Modal({ title, onClose, children, footer, size, headerExtra, bodyClassName, closeOnBackdrop = true, closeOnEscape = true, zIndex }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "lg" | "xl";
  headerExtra?: ReactNode;
  bodyClassName?: string;
  closeOnBackdrop?: boolean;
  /** false, gdy Escape obsługuje już skrót klawiszowy rodzica. */
  closeOnEscape?: boolean;
  /** Dla okna otwieranego nad innym oknem. */
  zIndex?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (closeOnEscape && e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, closeOnEscape]);

  return (
    <>
      <div className="modal-backdrop show" style={zIndex ? { zIndex } : undefined} />
      <div
        className="modal d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        style={zIndex ? { zIndex: zIndex + 5 } : undefined}
        onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
      >
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable${size ? ` modal-${size}` : ""}`}>
          <div className="modal-content">
            <div className="modal-header gap-2">
              <h2 className="modal-title fs-6 fw-semibold me-auto">{title}</h2>
              {headerExtra}
              <button type="button" className="btn-close" aria-label="Zamknij" onClick={onClose} />
            </div>
            <div className={`modal-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
