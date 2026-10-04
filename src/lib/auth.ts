import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";
import { checkSession, createSession, revokeSession, SESSION_MAX_AGE_SEC } from "@/lib/sessions";
import { isLoginBlocked, recordLoginAttempt } from "@/lib/loginThrottle";
import { clientIp } from "@/lib/clientIp";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      firstName: string;
      lastName: string;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
    /** Identyfikator sesji w rejestrze (UserSession). */
    sid: string;
  }
  // UWAGA: nie redeklarujemy `id` - DefaultUser ma już `id?: string`,
  // augmentacja musi mieć identyczne modyfikatory.
  interface User {
    role: Role;
    firstName: string;
    lastName: string;
  }
}

// Zamiast augmentować moduł "next-auth/jwt" (ścieżka różni się między wersjami NextAuth),
// używamy lokalnego typu i rzutowania w callbackach. Działa niezależnie od wersji.
type AppToken = {
  id?: string;
  role?: Role;
  firstName?: string;
  lastName?: string;
  sid?: string;
  mcp?: boolean;
  [key: string]: unknown;
};

// Hash-atrapa: dla nieistniejącego lub nieaktywnego konta wykonujemy to samo porównanie bcrypt,
// żeby czas odpowiedzi nie zdradzał, czy konto istnieje (SA-05).
const DUMMY_HASH = bcrypt.hashSync("iobrady-dummy-password-for-timing", 10);

class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SEC }, // 8h, dodatkowo limit bezczynności (lib/sessions)
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email i hasło",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Hasło", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.trim().toLowerCase();
        const { password } = parsed.data;
        const ip = clientIp(request.headers);

        // Limit nieudanych prób (konto+IP / konto / IP) - przed sprawdzaniem hasła.
        if (await isLoginBlocked(email, ip)) {
          await recordLoginAttempt(email, ip, false);
          throw new RateLimited();
        }

        const user = await prisma.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.active || !ok) {
          await recordLoginAttempt(email, ip, false);
          return null;
        }
        await recordLoginAttempt(email, ip, true);

        // Log logowania - nigdy nie blokuje sesji, nawet jeśli zapis się nie powiedzie.
        prisma.loginEvent.create({ data: { userId: user.id, role: user.role } }).catch(() => {});
        const sid = await createSession(user.id, { ip, userAgent: request.headers.get("user-agent") });

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          name: `${user.firstName} ${user.lastName}`,
          sid,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const t = token as AppToken;
      if (user) {
        const u = user as typeof user & { sid?: string; mustChangePassword?: boolean };
        t.id = user.id as string;
        t.role = user.role;
        t.firstName = user.firstName;
        t.lastName = user.lastName;
        t.sid = u.sid;
        t.mcp = !!u.mustChangePassword;
        return t;
      }
      // Każde kolejne użycie tokenu: weryfikacja z rejestrem sesji (unieważnienie, dezaktywacja,
      // zmiana roli, limit bezczynności). Tokeny bez `sid` (sprzed wdrożenia) są nieważne.
      const fresh = await checkSession(t.sid);
      if (!fresh) return null;
      t.role = fresh.role;
      t.firstName = fresh.firstName;
      t.lastName = fresh.lastName;
      t.email = fresh.email;
      t.mcp = fresh.mustChangePassword;
      return t;
    },
    async session({ session, token }) {
      const t = token as AppToken;
      session.user.id = t.id as string;
      session.user.role = t.role as Role;
      session.user.firstName = t.firstName as string;
      session.user.lastName = t.lastName as string;
      session.user.mustChangePassword = !!t.mcp;
      session.sid = t.sid as string;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const t = ("token" in message ? message.token : null) as AppToken | null;
      if (t?.sid) await revokeSession(t.sid, "logout");
    },
  },
});
