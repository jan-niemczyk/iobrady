import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Uwaga: middleware działa w środowisku Edge (bez dostępu do Prisma/Postgresa przez zwykłe
// TCP), więc bramka "czy kreator /setup został ukończony" NIE jest tu sprawdzana - żyje w
// poszczególnych layoutach (Server Components, zwykły Node.js) - patrz src/lib/setup.ts,
// wywoływane w (operator)/layout.tsx, (participant)/layout.tsx, login, account, chairperson.

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;
  const path = nextUrl.pathname;

  // Kreator pierwszego uruchomienia - dostępny zawsze, nawet przed zalogowaniem.
  if (path.startsWith("/setup") || path.startsWith("/api/setup")) {
    return NextResponse.next();
  }

  // strony publiczne (display - widok prezentacyjny dla sali; public - porządek/materiały/wyniki
  // posiedzenia z Meeting.publicEnabled=true, bez logowania)
  if (path === "/login" || path.startsWith("/api/auth") || path.startsWith("/display") || path.startsWith("/api/display") || path.startsWith("/public")) {
    if (isLoggedIn && path === "/login") {
      const target = role === "OPERATOR" ? "/dashboard" : "/session";
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts).*)"],
};
