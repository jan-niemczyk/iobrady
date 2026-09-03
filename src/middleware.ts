import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;
  const path = nextUrl.pathname;

  // strony publiczne (display - widok prezentacyjny dla sali)
  if (path === "/login" || path.startsWith("/api/auth") || path.startsWith("/display") || path.startsWith("/api/display")) {
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
  const operatorOnly = ["/dashboard", "/meetings", "/participants", "/archive", "/settings", "/votes", "/audit"];
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
