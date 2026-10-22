import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Moduł „Informacje”: komunikaty i dokumenty stałe niezależne od posiedzeń.
 *
 * Dostęp radnego wynika z BIEŻĄCYCH uprawnień: komunikat do grup widzi osoba, która jest teraz
 * aktywnym członkiem jednej z tych grup (nowy członek widzi aktualne dokumenty stałe, osoba
 * usunięta z grupy traci dostęp - także do plików pod bezpośrednim adresem). Kilka grup u tej
 * samej osoby nie tworzy duplikatów, bo widoczność liczona jest per komunikat.
 * Odczyt dotyczy konkretnej wersji treści i zapisuje się wyłącznie przy otwarciu treści.
 */

export { INFO_KIND_LABEL, INFO_STATUS_LABEL, INFO_CATEGORIES } from "@/lib/infoLabels";

export type InfoLink = { label: string; url: string };

export function normalizeLinks(raw: unknown): InfoLink[] {
  if (!Array.isArray(raw)) return [];
  const out: InfoLink[] = [];
  for (const x of raw.slice(0, 30)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const url = String(o.url ?? "").trim().slice(0, 1000);
    if (!/^https?:\/\/[^\s]+$/i.test(url)) continue;
    out.push({ label: String(o.label ?? "").trim().slice(0, 200) || url, url });
  }
  return out;
}

/** Aktywne członkostwa w grupach organizacyjnych w danej chwili. */
export async function activeOrgUnitIds(userId: string, at = new Date()): Promise<string[]> {
  const rows = await prisma.orgUnitMember.findMany({
    where: {
      userId, orgUnit: { active: true },
      OR: [{ validFrom: null }, { validFrom: { lte: at } }],
      AND: [{ OR: [{ validTo: null }, { validTo: { gte: at } }] }],
    },
    select: { orgUnitId: true },
  });
  return [...new Set(rows.map((r) => r.orgUnitId))];
}

/** Warunek Prisma: komunikaty widoczne dla radnego teraz (opublikowane, niewygasłe, w odbiorcach). */
export async function visibleWhere(userId: string, now = new Date()): Promise<Prisma.InfoPostWhereInput> {
  const units = await activeOrgUnitIds(userId, now);
  return {
    status: "PUBLISHED",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    AND: [{
      OR: [
        { audienceAll: true },
        { audienceUserIds: { has: userId } },
        ...(units.length ? [{ audienceOrgUnitIds: { hasSome: units } }] : []),
      ],
    }],
  };
}

/** Czy użytkownik (radny) może teraz otworzyć komunikat i jego pliki. Operator - zawsze. */
export async function canViewPost(user: { id: string; role: string; active?: boolean }, postId: string): Promise<boolean> {
  if (user.role === "OPERATOR") return true;
  const n = await prisma.infoPost.count({ where: { id: postId, ...(await visibleWhere(user.id)) } });
  return n > 0;
}

/**
 * Bieżący zbiór odbiorców (konta aktywne, bez operatorów) - do raportu odczytów i powiadomień.
 * „Wszyscy” oznacza wszystkie aktywne konta uczestników.
 */
export async function resolveAudience(post: { audienceAll: boolean; audienceOrgUnitIds: string[]; audienceUserIds: string[] }, at = new Date(), db: Prisma.TransactionClient | typeof prisma = prisma) {
  const ids = new Set<string>();
  if (post.audienceAll) {
    for (const u of await db.user.findMany({ where: { active: true, role: "PARTICIPANT" }, select: { id: true } })) ids.add(u.id);
  }
  if (post.audienceOrgUnitIds.length) {
    const rows = await db.orgUnitMember.findMany({
      where: {
        orgUnitId: { in: post.audienceOrgUnitIds }, orgUnit: { active: true },
        OR: [{ validFrom: null }, { validFrom: { lte: at } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: at } }] }],
      },
      select: { userId: true },
    });
    for (const r of rows) ids.add(r.userId);
  }
  for (const id of post.audienceUserIds) ids.add(id);
  if (ids.size === 0) return [];
  return db.user.findMany({
    where: { id: { in: [...ids] }, active: true, role: "PARTICIPANT" },
    select: { id: true, firstName: true, lastName: true, email: true, group: { select: { shortName: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

/** Powiadomienia w aplikacji dla bieżących odbiorców (bez e-maili i bez ponagleń). */
export async function notifyAudience(tx: Prisma.TransactionClient, userIds: string[], n: { kind: string; title: string; link: string }) {
  if (!userIds.length) return;
  await tx.notification.createMany({ data: userIds.map((userId) => ({ userId, kind: n.kind, title: n.title.slice(0, 300), link: n.link })) });
}
