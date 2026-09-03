import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      firstName: string;
      lastName: string;
    } & DefaultSession["user"];
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
  [key: string]: unknown;
};

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h sesja
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email i hasło",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Hasło", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          name: `${user.firstName} ${user.lastName}`,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const t = token as AppToken;
      if (user) {
        t.id = user.id as string;
        t.role = user.role;
        t.firstName = user.firstName;
        t.lastName = user.lastName;
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as AppToken;
      session.user.id = t.id as string;
      session.user.role = t.role as Role;
      session.user.firstName = t.firstName as string;
      session.user.lastName = t.lastName as string;
      return session;
    },
  },
});
