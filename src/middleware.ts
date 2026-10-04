import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { displayCookieName } from "@/lib/displayAccess";

// Middleware działa w runtime Node.js (config.runtime poniżej): `auth()` weryfikuje sesję
// z rejestrem w bazie (lib/sessions) - unieważniona, wygasła lub bezczynna sesja = niezalogowany.
// Bramka kreatora /setup żyje w layoutach (src/lib/setup.ts).

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Ścieżki dostępne mimo wymaganej zmiany hasła startowego.
const PASSWORD_CHANGE_ALLOWED = ["/account", "/api/account/password", "/api/auth", "/api/session/activity"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;
  const path = nextUrl.pathname;

  // CSRF (utwardzenie): żądania zmieniające stan z innej domeny są odrzucane. Przeglądarki
  // wysyłają Origin przy POST/PATCH/DELETE; klienci spoza przeglądarki go nie mają.
  if (path.startsWith("/api/") && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== "null") {
      let originHost = "";
      try { originHost = new URL(origin).host; } catch { /* nieprawidłowy Origin */ }
      if (originHost !== req.headers.get("host")) {
        return NextResponse.json({ error: "Niedozwolone żądanie z innej domeny." }, { status: 403 });
      }
    } else if (origin === "null") {
      return NextResponse.json({ error: "Niedozwolone żądanie." }, { status: 403 });
    }
  }

  // Kreator pierwszego uruchomienia - dostępny zawsze, nawet przed zalogowaniem.
  if (path.startsWith("/setup") || path.startsWith("/api/setup")) {
    return NextResponse.next();
  }

  // strony publiczne (display - widok prezentacyjny dla sali; public - porządek/materiały/wyniki
  // posiedzenia z Meeting.publicEnabled=true, bez logowania)
  // /api/uploads - wyłącznie obrazy prezentacji (logo, plansza reprezentacyjna), które i tak
  // wyświetla publiczny ekran sali; bez tego niezalogowany ekran prezentacji ich nie pobierze.
  // Ekran prezentacji / nakładka OBS z tokenem w linku: zapamiętaj token w ciasteczku (HttpOnly),
  // żeby klient ekranu (i ekran osadzony w nakładce) pobierał dane bez zmian w kodzie ekranów.
  // Weryfikacja tokenu: strona i /api/display (lib/displayAccess).
  const screen = path.match(/^\/(display|overlay)\/([A-Za-z0-9_-]{1,64})$/);
  const screenToken = nextUrl.searchParams.get("t");
  if (screen && screenToken && /^[A-Za-z0-9_-]{16,64}$/.test(screenToken)) {
    const res = NextResponse.next();
    res.cookies.set(displayCookieName(screen[2]), screenToken, {
      httpOnly: true, sameSite: "lax", path: "/",
      secure: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  if (path === "/api/health") return NextResponse.next();

  if (path === "/login" || path.startsWith("/api/auth") || path.startsWith("/display") || path.startsWith("/api/display") || path.startsWith("/overlay") || path.startsWith("/public") || path.startsWith("/api/uploads/")) {
    if (isLoggedIn && path === "/login") {
      const target = role === "OPERATOR" ? "/dashboard" : "/session";
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sesja wygasła - zaloguj się ponownie." }, { status: 401 });
    const url = new URL("/login", nextUrl);
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
  }

  // Wymuszona zmiana hasła startowego: do czasu zmiany dostępna jest tylko strona konta.
  if (req.auth?.user?.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.some((p) => path === p || path.startsWith(p + "/"))) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Najpierw zmień hasło startowe." }, { status: 403 });
    return NextResponse.redirect(new URL("/account?wymagana=1", nextUrl));
  }

  // ochrona zakresów po roli
  const operatorOnly = ["/dashboard", "/meetings", "/participants", "/archive", "/settings", "/votes", "/login-log"];
  const participantOnly = ["/session"];

  if (operatorOnly.some((p) => path.startsWith(p)) && role !== "OPERATOR") {
    return NextResponse.redirect(new URL("/session", nextUrl));
  }
  if (participantOnly.some((p) => path.startsWith(p)) && role === "OPERATOR") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }
  // Widok przewodniczącego: operator zawsze; uczestnik-przewodniczący danego posiedzenia
  // (weryfikacja per-posiedzenie po stronie strony/API na podstawie flagi isChairperson).
  if (path.startsWith("/chairperson") && role !== "OPERATOR" && role !== "PARTICIPANT") {
    return NextResponse.redirect(new URL("/session", nextUrl));
  }

  // strona główna -> redirect po roli
  if (path === "/") {
    const target = role === "OPERATOR" ? "/dashboard" : "/session";
    return NextResponse.redirect(new URL(target, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts).*)"],
};
