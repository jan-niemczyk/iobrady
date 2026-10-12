import { test, expect, type Browser, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Regresje ustaleń niezależnego audytu (IA-01..IA-10, BF-01..BF-03, UW-01, UW-02) na prawdziwym
 * serwerze HTTP i PostgreSQL - także równoległe żądania (IA-02, IA-07).
 *
 * Test zakłada odizolowane posiedzenia i konta przez Prismę (DATABASE_URL) i usuwa je na końcu.
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/audit-fixes.spec.ts
 */

const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const MID = `aud${RUN}`.slice(0, 16);
const MID2 = `au2${RUN}`.slice(0, 16);
const PW = "radny12345";
const OP_EMAIL = `aud-op-${RUN}@test.local`;
const PEOPLE = ["E", "A", "M", "K"] as const;
type Key = (typeof PEOPLE)[number];
const email = (k: Key) => `aud-${k.toLowerCase()}-${RUN}@test.local`;
const uid: Record<string, string> = {};
const mpid: Record<string, string> = {};
let itemId = "";
let listId = "";
let groupId = "";
let foreignItemId = "";

test.describe.configure({ mode: "serial" });
test.use({ launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {} });

type Session = Awaited<ReturnType<typeof login>>;
async function login(browser: Browser, mail: string) {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", mail);
  await page.fill("#password", mail === OP_EMAIL ? "operator12345" : PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const req = async (method: string, url: string, data?: unknown) => {
    const r: APIResponse = await ctx.request.fetch(url, { method, data, failOnStatusCode: false });
    const text = await r.text();
    let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { /* tekst */ }
    return { status: r.status(), text, json };
  };
  return { ctx, page, req };
}

async function openVote(op: Session, body: Record<string, unknown>) {
  const r = await op.req("POST", `/api/meetings/${MID}/votes`, {
    type: "STANDARD", visibility: "OPEN", majorityKind: "SIMPLE", majorityBase: "OF_VOTERS", openImmediately: true, options: [], ...body,
  });
  expect(r.status, r.text).toBe(200);
  return r.json.voteId as string;
}
const vote = (id: string) => prisma.vote.findUniqueOrThrow({ where: { id }, include: { options: { orderBy: { order: "asc" } } } });
const close = (op: Session, id: string) => op.req("POST", `/api/votes/${id}/close`);

test.beforeAll(async () => {
  const hash = await bcrypt.hash(PW, 10);
  await prisma.user.create({ data: { email: OP_EMAIL, passwordHash: await bcrypt.hash("operator12345", 10), firstName: "Operator", lastName: "Audytu", role: "OPERATOR" } });
  groupId = (await prisma.group.create({ data: { name: `Klub audytu ${RUN}`, shortName: `KA${RUN}`.slice(0, 10) } })).id;
  await prisma.meeting.create({ data: { id: MID, number: `A/${RUN}`, name: "Sesja testowa audytu", scheduledAt: new Date(), status: "IN_PROGRESS", openedAt: new Date(), attendanceMode: "MANUAL", attendanceOpen: true } });
  const item = await prisma.agendaItem.create({ data: { meetingId: MID, order: 1, number: "1", title: "Punkt testowy", status: "CURRENT", startedAt: new Date() } });
  itemId = item.id;
  await prisma.meeting.update({ where: { id: MID }, data: { currentAgendaItemId: item.id } });
  listId = (await prisma.speakerList.create({ data: { meetingId: MID, agendaItemId: item.id, selfSignupEnabled: true, defaultTimeLimitSec: 60 } })).id;
  await prisma.meeting.create({ data: { id: MID2, number: `B/${RUN}`, name: "Inne posiedzenie", scheduledAt: new Date(), status: "IN_PROGRESS" } });
  foreignItemId = (await prisma.agendaItem.create({ data: { meetingId: MID2, order: 1, number: "1", title: "Obcy punkt" } })).id;
  for (const k of PEOPLE) {
    const u = await prisma.user.create({ data: { email: email(k), passwordHash: hash, firstName: `Radny${k}`, lastName: `Test${k}`, role: "PARTICIPANT", groupId: k === "E" ? groupId : null } });
    uid[k] = u.id;
    const mp = await prisma.meetingParticipant.create({ data: { meetingId: MID, userId: u.id, hasVotingRight: true } });
    mpid[k] = mp.id;
    await prisma.attendance.create({ data: { participantId: mp.id, status: "PRESENT", source: "OPERATOR" } });
  }
});

test.afterAll(async () => {
  await prisma.meeting.deleteMany({ where: { id: { in: [MID, MID2] } } });
  await prisma.user.deleteMany({ where: { email: { in: [OP_EMAIL, ...PEOPLE.map(email)] } } });
  await prisma.group.deleteMany({ where: { id: groupId } });
  await prisma.$disconnect();
});

test("IA-01: powtórzone opcje odrzucone, liczniki i markery bez zmian", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const E = await login(browser, email("E"));
  const pk = await openVote(op, { title: "Tajny pakiet", type: "PACKAGE", visibility: "SECRET", options: [{ label: "Poz. 1" }, { label: "Poz. 2" }] });
  const [a, b] = (await vote(pk)).options.map((o) => o.id);
  let r = await E.req("POST", `/api/votes/${pk}/cast`, { packageChoices: [{ optionId: a, choice: "YES" }, { optionId: a, choice: "YES" }] });
  expect(r.status).toBe(400);
  expect(await prisma.secretBallotMarker.count({ where: { voteId: pk } })).toBe(0);
  expect((await vote(pk)).options.map((o) => o.secretYes)).toEqual([0, 0]);
  r = await E.req("POST", `/api/votes/${pk}/cast`, { packageChoices: [{ optionId: a, choice: "YES" }, { optionId: b, choice: "NO" }] });
  expect(r.status, r.text).toBe(200);
  expect((await vote(pk)).options.map((o) => [o.secretYes, o.secretNo])).toEqual([[1, 0], [0, 1]]);
  await close(op, pk);
  // BF-02: tajny pakiet - liczba kart z markerów
  expect((await vote(pk)).resultCastCount).toBe(1);

  const lv = await openVote(op, { title: "Tajna lista", type: "LIST", visibility: "SECRET", minSelections: 2, maxSelections: 2, options: [{ label: "Kand. 1" }, { label: "Kand. 2" }, { label: "Kand. 3" }] });
  const [c1] = (await vote(lv)).options.map((o) => o.id);
  r = await E.req("POST", `/api/votes/${lv}/cast`, { selectedOptionIds: [c1, c1] });
  expect(r.status).toBe(400);
  expect(await prisma.secretBallotMarker.count({ where: { voteId: lv } })).toBe(0);
  await close(op, lv);

  const ol = await openVote(op, { title: "Jawna lista", type: "LIST", minSelections: 1, maxSelections: 2, options: [{ label: "X" }, { label: "Y" }] });
  const [x] = (await vote(ol)).options.map((o) => o.id);
  expect((await E.req("POST", `/api/votes/${ol}/cast`, { selectedOptionIds: [x, x] })).status).toBe(400);
  await close(op, ol);
});

test("IA-02: równoległe głosy przy „pierwszy głos ostateczny” - dokładnie jeden przyjęty", async ({ browser }) => {
  test.setTimeout(180_000);
  const op = await login(browser, OP_EMAIL);
  const E = await login(browser, email("E"));
  for (let round = 0; round < 3; round++) {
    const v = await openVote(op, { title: `Ostateczny ${round}`, firstVoteFinal: true });
    const choices = ["YES", "NO", "ABSTAIN", "YES", "NO", "ABSTAIN", "YES", "NO"];
    const res = await Promise.all(choices.map((choice) => E.req("POST", `/api/votes/${v}/cast`, { choice })));
    const ok = res.map((x, i) => [x.status, choices[i]] as const).filter(([s]) => s === 200);
    expect(ok.length, res.map((x) => x.status).join(",")).toBe(1);
    expect(res.filter((x) => x.status === 409).length).toBe(choices.length - 1);
    const ballot = await prisma.ballot.findUniqueOrThrow({ where: { voteId_userId: { voteId: v, userId: uid.E } } });
    expect(ballot.choice).toBe(ok[0][1]);
    await close(op, v);
  }
});

test("IA-07: zerowanie i zamknięcie równolegle - zapis głosów zgodny z wynikiem", async ({ browser }) => {
  test.setTimeout(180_000);
  const op = await login(browser, OP_EMAIL);
  const op2 = await login(browser, OP_EMAIL);
  for (let i = 0; i < 30; i++) {
    const v = await openVote(op, { title: `Zerowanie ${i}` });
    for (const k of ["E", "A"] as Key[]) await op.req("POST", `/api/votes/${v}/cast`, { onBehalfUserId: uid[k], choice: "YES" });
    // Różne przesunięcia w obie strony - okno między sprawdzeniem stanu a usunięciem głosu.
    const d = (i % 10) * 2;
    const later = <T,>(f: () => Promise<T>, ms: number) => new Promise((res) => setTimeout(res, ms)).then(f);
    const [rs, cl] = await Promise.all([
      later(() => op.req("POST", `/api/votes/${v}/cast`, { onBehalfUserId: uid.E, reset: true }), i % 2 ? d : 0),
      later(() => op2.req("POST", `/api/votes/${v}/close`), i % 2 ? 0 : d),
    ]);
    expect(cl.status, `${cl.text} / zerowanie ${rs.status} ${rs.text}`).toBe(200);
    expect([200, 409]).toContain(rs.status);
    const after = await vote(v);
    const ballots = await prisma.ballot.count({ where: { voteId: v, choice: "YES" } });
    expect(after.status).toBe("CLOSED");
    expect(after.resultYes, `zerowanie ${rs.status}`).toBe(ballots);
    expect(after.resultCastCount).toBe(await prisma.ballot.count({ where: { voteId: v } }));
  }
});

test("BF-01: kworum - jedno rozstrzygnięcie w obu polach", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const E = await login(browser, email("E"));
  await prisma.meeting.update({ where: { id: MID }, data: { quorumRule: "MORE_THAN_HALF" } });
  const q = await openVote(op, { title: "Kworum", type: "QUORUM" });
  expect((await E.req("POST", `/api/votes/${q}/cast`, {})).status).toBe(200);
  await close(op, q);
  const v = await vote(q);
  expect(v.resultQuorumMet).toBe(v.resultPassed);
  expect(v.resultPassed).toBe(false); // 1 z 4 uprawnionych
});

test("BF-03: automatyczne zamknięcie po ostatnim głosie tajnym", async ({ browser }) => {
  test.setTimeout(180_000);
  const op = await login(browser, OP_EMAIL);
  // Zamknięcie kworum (poprzedni test) aktualizuje obecność - tu wszyscy znów obecni.
  await prisma.attendance.updateMany({ where: { participantId: { in: Object.values(mpid) } }, data: { status: "PRESENT" } });
  await op.req("PATCH", `/api/meetings/${MID}`, { autoCloseVotes: true });
  const v = await openVote(op, { title: "Tajne auto", visibility: "SECRET" });
  for (const k of PEOPLE) {
    const s = await login(browser, email(k));
    expect((await s.req("POST", `/api/votes/${v}/cast`, { choice: "YES" })).status).toBe(200);
    await s.ctx.close();
    if (k !== PEOPLE[PEOPLE.length - 1]) expect((await vote(v)).status).toBe("OPEN");
  }
  expect((await vote(v)).status).toBe("CLOSED");
  await op.req("PATCH", `/api/meetings/${MID}`, { autoCloseVotes: false });
});

test("IA-03: w trybie MANUAL uczestnik nie potwierdza sam obecności", async ({ browser }) => {
  const A = await login(browser, email("A"));
  await prisma.attendance.update({ where: { participantId: mpid.A }, data: { status: "ABSENT" } });
  let r = await A.req("POST", `/api/meetings/${MID}/attendance/mark`, { participantId: mpid.A, status: "PRESENT" });
  expect(r.status).toBe(403);
  expect((await prisma.attendance.findUniqueOrThrow({ where: { participantId: mpid.A } })).status).toBe("ABSENT");
  await prisma.meeting.update({ where: { id: MID }, data: { attendanceMode: "SELF_CONFIRMATION" } });
  r = await A.req("POST", `/api/meetings/${MID}/attendance/mark`, { participantId: mpid.A, status: "PRESENT" });
  expect(r.status).toBe(200);
  await prisma.meeting.update({ where: { id: MID }, data: { attendanceMode: "MANUAL" } });
});

test("IA-04: komunikaty grupowe i lista ukryta filtrowane na serwerze", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const E = await login(browser, email("E"));
  const A = await login(browser, email("A"));
  expect((await op.req("POST", `/api/meetings/${MID}/messages`, { content: `Tylko dla klubu ${RUN}`, visibleToAll: false, visibleGroupIds: [groupId] })).status).toBe(200);
  const sE = (await E.req("GET", `/api/me/session?m=${MID}`)).json;
  const sA = (await A.req("GET", `/api/me/session?m=${MID}`)).json;
  expect(sE.messages.some((m: { content: string }) => m.content.includes(RUN))).toBe(true);
  expect(sA.messages.some((m: { content: string }) => m.content.includes(RUN))).toBe(false);
  await prisma.speakerList.update({ where: { id: listId }, data: { visibleToParticipants: false } });
  await prisma.speakerListEntry.createMany({ data: [
    { speakerListId: listId, userId: uid.E, order: 1, status: "WAITING", entryType: "REGULAR" },
    { speakerListId: listId, userId: uid.A, order: 2, status: "WAITING", entryType: "REGULAR" },
  ] });
  const lA = (await A.req("GET", `/api/me/session?m=${MID}`)).json.speakerList.entries;
  expect(lA.length).toBe(1);
  expect(lA[0].isMe).toBe(true);
  const disp = await op.req("GET", `/api/display/${MID}`);
  expect(disp.text.includes(`Tylko dla klubu ${RUN}`)).toBe(false);
  await prisma.speakerListEntry.deleteMany({ where: { speakerListId: listId } });
  await prisma.speakerList.update({ where: { id: listId }, data: { visibleToParticipants: true } });
});

test("IA-05/06: limit czasu ustala prowadzący; historia wystąpień chroniona", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const M = await login(browser, email("M"));
  // Wartość spoza zakresu - odrzucona; w zakresie od uczestnika - pominięta (limit listy, 60 s).
  expect((await M.req("POST", `/api/speakerlists/${listId}/entries`, { timeLimitSec: 36000 })).status).toBe(400);
  let r = await M.req("POST", `/api/speakerlists/${listId}/entries`, { timeLimitSec: 600 });
  expect(r.status, r.text).toBe(200);
  const entry = await prisma.speakerListEntry.findUniqueOrThrow({ where: { id: r.json.entryId } });
  expect(entry.timeLimitSec).toBe(60);
  await prisma.speakerListEntry.update({ where: { id: entry.id }, data: { status: "FINISHED", endedAt: new Date() } });
  expect((await M.req("DELETE", `/api/speaker-entries/${entry.id}`)).status).toBe(409);
  expect((await M.req("POST", `/api/speaker-entries/${entry.id}/withdraw`)).status).toBe(409);
  expect((await prisma.speakerListEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("FINISHED");
  r = await op.req("DELETE", `/api/speaker-entries/${entry.id}`);
  expect(r.status).toBe(200);
  expect(await prisma.auditLog.count({ where: { meetingId: MID, action: "SPEAKER_ENTRY_REMOVED" } })).toBe(1);
  // własne oczekujące - nadal można wycofać
  r = await M.req("POST", `/api/speakerlists/${listId}/entries`, {});
  expect((await M.req("POST", `/api/speaker-entries/${r.json.entryId}/withdraw`)).status).toBe(200);
});

test("IA-09: notatka tylko przy punkcie własnego posiedzenia", async ({ browser }) => {
  const K = await login(browser, email("K"));
  expect((await K.req("PUT", `/api/agenda/${foreignItemId}/note`, { content: "x" })).status).toBe(404);
  expect(await prisma.agendaItemNote.count({ where: { agendaItemId: foreignItemId } })).toBe(0);
  expect((await K.req("PUT", `/api/agenda/${itemId}/note`, { content: "moja notatka" })).status).toBe(200);
});

test("UW-02: wykluczony przewodniczący nie zamyka głosowania", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  await prisma.meetingParticipant.update({ where: { id: mpid.K }, data: { isChairperson: true, excludedFromMeeting: true } });
  const K = await login(browser, email("K"));
  const v = await openVote(op, { title: "Przewodniczący" });
  expect((await K.req("POST", `/api/votes/${v}/close`)).status).toBe(403);
  await prisma.meetingParticipant.update({ where: { id: mpid.K }, data: { excludedFromMeeting: false } });
  expect((await K.req("POST", `/api/votes/${v}/close`)).status).toBe(200);
  await prisma.meetingParticipant.update({ where: { id: mpid.K }, data: { isChairperson: false } });
});

test("UW-01: SVG z prefiksem przestrzeni nazw odrzucony; /uploads przez trasę z sandboxem", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const bad = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>document.documentElement.setAttribute("data-audit","1")</s:script></svg>`;
  const r = await op.ctx.request.post("/api/settings/logo", { multipart: { file: { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(bad) } }, failOnStatusCode: false });
  expect(r.status()).toBe(400);
  const ent = `<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"><rect width="1" height="1"/></a></svg>`;
  const r2 = await op.ctx.request.post("/api/settings/logo", { multipart: { file: { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(ent) } }, failOnStatusCode: false });
  expect(r2.status()).toBe(400);
  const ok = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123"/></svg>`;
  const r3 = await op.ctx.request.post("/api/settings/logo", { multipart: { file: { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(ok) } }, failOnStatusCode: false });
  expect(r3.status(), await r3.text()).toBe(200);
  const url = (await prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } })).presentationLogoUrl!;
  const name = url.replace("/api/uploads/", "");
  const st = await op.ctx.request.get(`/uploads/${name}`, { failOnStatusCode: false });
  expect(st.status()).toBe(200);
  expect(st.headers()["content-security-policy"] ?? "").toContain("sandbox");
  await op.ctx.request.delete("/api/settings/logo", { failOnStatusCode: false });

  // Plik z aktywną treścią wgrany przed poprawką (zapisany wprost w katalogu) - w przeglądarce
  // otwarty bezpośrednio pod obiema ścieżkami nie wykonuje skryptu (CSP sandbox).
  const fs = await import("node:fs");
  const path = await import("node:path");
  const evil = `audit-${RUN}.svg`;
  const dir = path.join(process.cwd(), "public", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, evil), `<svg xmlns="http://www.w3.org/2000/svg"><script>document.documentElement.setAttribute("data-audit","1")</script></svg>`);
  try {
    for (const u of [`/api/uploads/${evil}`, `/uploads/${evil}`]) {
      await op.page.goto(u);
      await op.page.waitForTimeout(300);
      expect(await op.page.evaluate(() => document.documentElement.getAttribute("data-audit")), u).toBeNull();
    }
  } finally {
    fs.rmSync(path.join(dir, evil), { force: true });
  }
});

test("IA-10: strumień zdarzeń zamknięty po usunięciu z posiedzenia", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const A = await login(browser, email("A"));
  await A.page.goto("/account");
  await A.page.evaluate((mid) => {
    const w = window as unknown as { __ev: string[]; __es: EventSource };
    w.__ev = [];
    w.__es = new EventSource(`/api/meetings/${mid}/stream`);
    w.__es.onmessage = (e) => w.__ev.push(e.data);
  }, MID);
  await A.page.waitForFunction(() => (window as unknown as { __ev: string[] }).__ev.length > 0);
  await prisma.meetingParticipant.delete({ where: { id: mpid.A } });
  await A.page.waitForTimeout(5500); // ważność sprawdzenia członkostwa: 5 s
  const before = await A.page.evaluate(() => (window as unknown as { __ev: string[] }).__ev.length);
  await op.req("POST", `/api/meetings/${MID}/messages`, { content: `po usunięciu ${RUN}` });
  await A.page.waitForTimeout(1500);
  const after = await A.page.evaluate(() => (window as unknown as { __ev: string[] }).__ev.length);
  expect(after).toBe(before);
});
