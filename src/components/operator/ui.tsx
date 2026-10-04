// Wspólne elementy układu panelu operatora (Bootstrap 5.3). Jeden wygląd nagłówków kart
// i nagłówków stron w całym panelu.
import type { ReactNode } from "react";

/** Nagłówek karty: tytuł po lewej, akcje po prawej (zawijają się pod tytuł, gdy brak miejsca). */
export function CardHeader({ title, right, tone, sub }: {
  title: ReactNode;
  right?: ReactNode;
  tone?: "live" | "danger";
  sub?: ReactNode;
}) {
  const toneCls = tone === "live" ? " bg-danger-subtle border-danger-subtle" : "";
  return (
    <div className={`card-header${toneCls}`}>
      <div className="min-w-0">
        <h2 className={`card-title-text${tone ? " text-danger" : ""}`}>{title}</h2>
        {sub && <div className="small text-body-secondary">{sub}</div>}
      </div>
      {right && <div className="d-flex flex-wrap align-items-center gap-2">{right}</div>}
    </div>
  );
}

/** Nagłówek strony panelu: opcjonalna linia nad tytułem, tytuł, opis i akcje. */
export function PageHeader({ kicker, title, description, actions }: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {kicker && <div className="page-kicker">{kicker}</div>}
        <h1>{title}</h1>
        {description && <p className="text-body-secondary mb-0 mt-1">{description}</p>}
      </div>
      {actions && <div className="d-flex flex-wrap align-items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Kontener strony panelu - jednolite marginesy i maksymalna szerokość. */
export function PageContainer({ children, size = "lg" }: { children: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const maxWidth = { sm: 720, md: 960, lg: 1200, xl: 1680 }[size];
  return (
    <div className="container-fluid px-3 px-lg-4 py-4" style={{ maxWidth }}>
      {children}
    </div>
  );
}
