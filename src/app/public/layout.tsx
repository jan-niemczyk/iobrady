import "../bootstrap-scoped.css";
import "./public.css";

/**
 * Publiczny widok posiedzenia (bez logowania). Bootstrap ładowany tylko tutaj i w panelu operatora -
 * ekrany radnych, prezentacja i transmisja go nie wczytują.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="pub-root">{children}</div>;
}
