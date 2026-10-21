import { prisma } from "@/lib/db";
import { resolveAudience } from "@/lib/info";

export type InfoReadRow = {
  userId: string; name: string; club: string | null; current: boolean;
  readCurrent: boolean; firstOpenedAt: string | null; lastOpenedAt: string | null; openCount: number;
  earlierVersions: number[];
};

/**
 * Zestawienie otwarć komunikatu: bieżący odbiorcy oraz osoby, które otworzyły treść wcześniej,
 * a dziś nie są już odbiorcami (current=false). Zmiana składu grupy nie tworzy fikcyjnych odczytów -
 * pokazywane są wyłącznie zapisane otwarcia.
 */
export async function infoReadReport(postId: string) {
  const post = await prisma.infoPost.findUnique({ where: { id: postId } });
  if (!post) return null;
  const [audience, reads] = await Promise.all([
    resolveAudience(post),
    prisma.infoRead.findMany({ where: { postId }, orderBy: { version: "asc" } }),
  ]);
  const byUser = new Map<string, typeof reads>();
  for (const r of reads) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  const audIds = new Set(audience.map((u) => u.id));
  const formerIds = [...byUser.keys()].filter((id) => !audIds.has(id));
  const former = formerIds.length
    ? await prisma.user.findMany({ where: { id: { in: formerIds } }, select: { id: true, firstName: true, lastName: true, group: { select: { shortName: true } } } })
    : [];
  const row = (u: { id: string; firstName: string; lastName: string; group: { shortName: string | null } | null }, current: boolean): InfoReadRow => {
    const rs = byUser.get(u.id) ?? [];
    const cur = rs.find((r) => r.version === post.version);
    return {
      userId: u.id, name: `${u.lastName} ${u.firstName}`, club: u.group?.shortName ?? null, current,
      readCurrent: !!cur, firstOpenedAt: cur?.firstOpenedAt.toISOString() ?? null, lastOpenedAt: cur?.lastOpenedAt.toISOString() ?? null,
      openCount: cur?.openCount ?? 0, earlierVersions: rs.filter((r) => r.version !== post.version).map((r) => r.version),
    };
  };
  const rows = [...audience.map((u) => row(u, true)), ...former.map((u) => row(u, false))];
  return {
    post: { id: post.id, title: post.title, version: post.version, status: post.status, publishedAt: post.publishedAt?.toISOString() ?? null },
    rows,
    summary: { recipients: audience.length, readCurrent: rows.filter((r) => r.current && r.readCurrent).length },
  };
}
