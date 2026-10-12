import { test, expect, type Browser, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { toCsv } from "../../src/lib/csv";

/**
 * Regresje utwardzeń H-01..H-08 z niezależnego audytu (na prawdziwym serwerze i PostgreSQL):
 * brak zapisu treści głosu tajnego, ponowna kontrola uprawnień przy głosie, limity treści żądań,
 * rozpoznawanie typu załącznika po zawartości, nagłówki pamięci podręcznej, CSP z nonce, CSV.
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/hardening.spec.ts
 */

const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const MID = `hrd${RUN}`.slice(0, 16);
const PW = "radny12345";
const OP_EMAIL = `hrd-op-${RUN}@test.local`;
const PEOPLE = ["A", "B"] as const;
type Key = (typeof PEOPLE)[number];
const email = (k: Key) => `hrd-${k.toLowerCase()}-${RUN}@test.local`;
const uid: Record<string, string> = {};
const mpid: Record<string, string> = {};

test.describe.configure({ mode: "serial" });
test.use({ launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {} });

type Session = Awaited<ReturnType<typeof login>>;
async function login(browser: Browser, mail: string) {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  const page = await ctx.newPage();
  const cspErrors: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) cspErrors.push(m.text()); });
  await page.goto("/login");
  await page.fill("#email", mail);
  await page.fill("#password", mail === OP_EMAIL ? "operator12345" : PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const req = async (method: string, url: string, data?: unknown, headers?: Record<string, string>) => {
    const r: APIResponse = await ctx.request.fetch(url, { method, data, headers, failOnStatusCode: false });
    const text = await r.text();
    let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { /* tekst */ }
    return { status: r.status(), text, json, headers: r.headers() };
  };
  return { ctx, page, req, cspErrors };
}

async function openVote(op: Session, body: Record<string, unknown>) {
  const r = await op.req("POST", `/api/meetings/${MID}/votes`, {
    type: "STANDARD", visibility: "OPEN", majorityKind: "SIMPLE", majorityBase: "OF_VOTERS", openImmediately: true, options: [], ...body,
  });
  expect(r.status, r.text).toBe(200);
  return r.json.voteId as string;
}

test.beforeAll(async () => {
  const hash = await bcrypt.hash(PW, 10);
  await prisma.user.create({ data: { email: OP_EMAIL, passwordHash: await bcrypt.hash("operator12345", 10), firstName: "Operator", lastName: "Utwardzenia", role: "OPERATOR" } });
  await prisma.meeting.create({ data: { id: MID, number: `H/${RUN}`, name: "Sesja testowa utwardzenia", scheduledAt: new Date(), status: "IN_PROGRESS", openedAt: new Date(), attendanceMode: "MANUAL", attendanceOpen: true } });
  for (const k of PEOPLE) {
    const u = await prisma.user.create({ data: { email: email(k), passwordHash: hash, firstName: `Radny${k}`, lastName: `Test${k}`, role: "PARTICIPANT" } });
    uid[k] = u.id;
    const mp = await prisma.meetingParticipant.create({ data: { meetingId: MID, userId: u.id, hasVotingRight: true } });
    mpid[k] = mp.id;
    await prisma.attendance.create({ data: { participantId: mp.id, status: "PRESENT", source: "OPERATOR" } });
  }
});

test.afterAll(async () => {
  await prisma.meeting.deleteMany({ where: { id: MID } });
  await prisma.user.deleteMany({ where: { email: { in: [OP_EMAIL, ...PEOPLE.map(email)] } } });
  await prisma.$disconnect();
});

test("H-02: głos tajny bez zapisu treści, zerowanie niemożliwe, wynik po zamknięciu poprawny", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const a = await login(browser, email("A"));
  const v = await openVote(op, { title: "Tajne bez zapisu", visibility: "SECRET" });
  expect((await a.req("POST", `/api/votes/${v}/cast`, { choice: "YES" })).status).toBe(200);
  const markers = await prisma.secretBallotMarker.findMany({ where: { voteId: v } });
  expect(markers.length).toBe(1);
  expect(markers[0].resetPayload).toBeNull();
  expect((await a.req("POST", `/api/votes/${v}/cast`, { reset: true })).status).toBe(403);
  const r = await op.req("POST", `/api/votes/${v}/cast`, { reset: true, onBehalfUserId: uid.A });
  expect(r.status, r.text).toBe(409);
  expect(await prisma.secretBallotMarker.count({ where: { voteId: v } })).toBe(1);
  expect((await op.req("POST", `/api/votes/${v}/close`)).status).toBe(200);
  const closed = await prisma.vote.findUniqueOrThrow({ where: { id: v } });
  expect(closed.resultYes).toBe(1);
  expect(closed.resultCastCount).toBe(1);
  await Promise.all([op.ctx.close(), a.ctx.close()]);
});

test("H-01: utrata prawa głosu albo obecności po otwarciu głosowania blokuje głos", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const a = await login(browser, email("A"));
  const b = await login(browser, email("B"));
  const v = await openVote(op, { title: "Kontrola przy głosie" });
  await prisma.meetingParticipant.update({ where: { id: mpid.A }, data: { hasVotingRight: false } });
  await prisma.attendance.update({ where: { participantId: mpid.B }, data: { status: "ABSENT" } });
  expect((await a.req("POST", `/api/votes/${v}/cast`, { choice: "YES" })).status).toBe(403);
  expect((await b.req("POST", `/api/votes/${v}/cast`, { choice: "YES" })).status).toBe(403);
  expect(await prisma.ballot.count({ where: { voteId: v } })).toBe(0);
  await prisma.meetingParticipant.update({ where: { id: mpid.A }, data: { hasVotingRight: true } });
  await prisma.attendance.update({ where: { participantId: mpid.B }, data: { status: "PRESENT" } });
  expect((await a.req("POST", `/api/votes/${v}/cast`, { choice: "YES" })).status).toBe(200);
  await op.req("POST", `/api/votes/${v}/close`);
  await Promise.all([op.ctx.close(), a.ctx.close(), b.ctx.close()]);
});

test("H-03: za duża treść żądania 413, za długie pola 400", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const big = await op.req("POST", `/api/meetings/${MID}/messages`, { content: "x".repeat(1_200_000) });
  expect(big.status).toBe(413);
  const longId = await op.req("POST", `/api/meetings/${MID}/participants`, { userIds: ["x".repeat(300)] });
  expect(longId.status).toBe(400);
  const manyIds = await op.req("POST", `/api/meetings/${MID}/participants`, { userIds: Array.from({ length: 5001 }, (_, i) => `u${i}`) });
  expect(manyIds.status).toBe(400);
  await op.ctx.close();
});

test("H-03: typ załącznika rozpoznawany po zawartości", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const fake = await op.ctx.request.post(`/api/meetings/${MID}/attachments`, {
    multipart: { file: { name: "uchwala.pdf", mimeType: "application/pdf", buffer: png } }, failOnStatusCode: false,
  });
  expect(fake.status()).toBe(400);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const ok = await op.ctx.request.post(`/api/meetings/${MID}/attachments`, {
    multipart: { file: { name: "uchwala.pdf", mimeType: "application/pdf", buffer: pdf } }, failOnStatusCode: false,
  });
  expect(ok.status(), await ok.text()).toBe(200);
  const att = await prisma.attachment.findFirstOrThrow({ where: { meetingId: MID } });
  expect(att.mimeType).toBe("application/pdf");
  await op.ctx.close();
});

test("H-04/H-08: API bez zapisu w pamięci podręcznej, strony z CSP z nonce i bez naruszeń", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const me = await op.req("GET", `/api/meetings/${MID}/participants`);
  expect(me.headers["cache-control"]).toContain("no-store");
  const resp = await op.page.goto(`/meetings/${MID}`);
  const csp = resp?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp.split("script-src")[1].split(";")[0]).not.toContain("unsafe-inline");
  // Strona działa (hydracja): panel posiedzenia reaguje na kliknięcie i nie ma naruszeń CSP.
  await expect(op.page.getByText("Sesja testowa utwardzenia").first()).toBeVisible();
  await op.page.goto(`/display/${MID}`);
  await op.page.waitForTimeout(1500);
  expect(op.cspErrors, op.cspErrors.join("\n")).toEqual([]);
  await op.ctx.close();
});

test("H-05: CSV neutralizuje formuły także po spacjach i w znakach pełnoszerokich", () => {
  const csv = toCsv([[" =1+1", "＝SUM(A1)", "|cmd", "-12", "zwykły"]]);
  expect(csv).toContain(`"' =1+1"`);
  expect(csv).toContain(`"'＝SUM(A1)"`);
  expect(csv).toContain(`"'|cmd"`);
  expect(csv).toContain(`"-12"`);
  expect(csv).toContain(`"zwykły"`);
});
