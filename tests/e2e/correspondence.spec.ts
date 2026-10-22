import { test, expect, type Browser, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Trwałe usuwanie i numeracja spraw, stała kolejność pism w sprawie, konto odpowiadającego
 * (dostęp wyłącznie do przypisanych spraw, egzekwowany w API), trwałe usuwanie informacji,
 * funkcja z grupy posiedzenia na liście mówców.
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/correspondence.spec.ts
 */

const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const PW = "radny12345";
const OP_EMAIL = `cor-op-${RUN}@test.local`;
const PT_EMAIL = `cor-pt-${RUN}@test.local`;
const RESP_EMAIL = `cor-resp-${RUN}@test.local`;
const MID = `cor${RUN}`.slice(0, 16);
// Okres numeracji odległy od danych innych testów.
const RECEIVED = "2031-03-10T10:00:00.000Z";
const created: string[] = [];
let ptId = "";
let unitId = "";
let before: { inquiriesEnabled: boolean; inquiryNumberScope: string } | null = null;

test.describe.configure({ mode: "serial" });
test.use({ launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {} });

async function login(browser: Browser, mail: string, pw: string) {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", mail);
  await page.fill("#password", pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const req = async (method: string, url: string, data?: unknown) => {
    const r: APIResponse = await ctx.request.fetch(url, { method, data, failOnStatusCode: false, maxRedirects: 0 });
    const text = await r.text();
    let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { /* tekst */ }
    return { status: r.status(), text, json };
  };
  return { ctx, page, req };
}

test.beforeAll(async () => {
  before = await prisma.settings.findUniqueOrThrow({ where: { id: "singleton" }, select: { inquiriesEnabled: true, inquiryNumberScope: true } });
  await prisma.settings.update({ where: { id: "singleton" }, data: { inquiriesEnabled: true, inquiryNumberScope: "YEAR" } });
  await prisma.user.create({ data: { email: OP_EMAIL, passwordHash: await bcrypt.hash("operator12345", 10), firstName: "Operator", lastName: "Korespondencji", role: "OPERATOR" } });
  ptId = (await prisma.user.create({ data: { email: PT_EMAIL, passwordHash: await bcrypt.hash(PW, 10), firstName: "Zofia", lastName: "Łęcka", role: "PARTICIPANT", functionTitle: "Radna" } })).id;
});

test.afterAll(async () => {
  await prisma.inquiryCase.deleteMany({ where: { id: { in: created } } });
  await prisma.meeting.deleteMany({ where: { id: MID } });
  if (unitId) await prisma.orgUnit.deleteMany({ where: { id: unitId } });
  await prisma.user.deleteMany({ where: { email: { in: [OP_EMAIL, PT_EMAIL, RESP_EMAIL] } } });
  if (before) await prisma.settings.update({ where: { id: "singleton" }, data: before });
  await prisma.$disconnect();
});

const external = (title: string) => ({ kind: "QUESTION", title, body: "Treść zapytania.", authors: [{ name: "Jan Zewnętrzny" }], addressees: [{ name: "Burmistrz Miasta" }], receivedAt: RECEIVED, registerNow: true });

test("usunięcie ostatniej sprawy zwalnia numer; usunięcie wcześniejszej nie przenumerowuje i nie tworzy duplikatu", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL, "operator12345");
  const nums: string[] = [];
  const ids: string[] = [];
  for (const t of ["A", "B", "C"]) {
    const r = await op.req("POST", "/api/inquiries", external(`Numeracja ${t}`));
    expect(r.status, r.text).toBe(200);
    ids.push(r.json.id);
    created.push(r.json.id);
    nums.push((await op.req("GET", `/api/inquiries/${r.json.id}`)).json.number);
  }
  const n = (s: string) => Number(s.split("/")[0]);
  expect(n(nums[1])).toBe(n(nums[0]) + 1);
  expect(n(nums[2])).toBe(n(nums[0]) + 2);
  // Ostatnia: numer wraca do puli.
  expect((await op.req("DELETE", `/api/inquiries/${ids[2]}`)).status).toBe(200);
  expect(await prisma.inquiryCase.count({ where: { id: ids[2] } })).toBe(0);
  const d = await op.req("POST", "/api/inquiries", external("Numeracja D"));
  created.push(d.json.id);
  expect((await op.req("GET", `/api/inquiries/${d.json.id}`)).json.number).toBe(nums[2]);
  // Wcześniejsza: luka zostaje, pozostałe numery bez zmian, kolejna sprawa dostaje następny wolny.
  expect((await op.req("DELETE", `/api/inquiries/${ids[0]}`)).status).toBe(200);
  expect((await op.req("GET", `/api/inquiries/${ids[1]}`)).json.number).toBe(nums[1]);
  const e = await op.req("POST", "/api/inquiries", external("Numeracja E"));
  created.push(e.json.id);
  expect(n((await op.req("GET", `/api/inquiries/${e.json.id}`)).json.number)).toBe(n(nums[0]) + 3);
  // Uczestnik nie usunie cudzej sprawy.
  const pt = await login(browser, PT_EMAIL, PW);
  expect([403, 404]).toContain((await pt.req("DELETE", `/api/inquiries/${ids[1]}`)).status);
  await Promise.all([op.ctx.close(), pt.ctx.close()]);
});

test("pisma w sprawie: stały numer nadawany przy złożeniu, niezależny od wpisanych dat", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL, "operator12345");
  const r = await op.req("POST", "/api/inquiries", external("Kolejność pism"));
  created.push(r.json.id);
  const id = r.json.id;
  const ad = (await op.req("GET", `/api/inquiries/${id}`)).json.addressees[0];
  await op.req("PATCH", `/api/inquiries/${id}/addressees/${ad.id}`, { forwardedAt: RECEIVED });
  // Odpowiedź z datą wcześniejszą niż pismo wnoszące i data samego dnia (południe) - nadal pismo 2.
  const a1 = await op.req("POST", `/api/inquiries/${id}/letters`, { kind: "ANSWER", addresseeId: ad.id, body: "Odpowiedź", letterDate: "2031-01-01", receivedAt: "2031-01-02T12:00:00.000Z" });
  expect(a1.status, a1.text).toBe(200);
  const s1 = await op.req("POST", `/api/inquiries/${id}/letters`, { kind: "SUPPLEMENT", addresseeId: ad.id, body: "Uzupełnienie", receivedAt: "2030-12-01T08:00:00.000Z" });
  expect(s1.status, s1.text).toBe(200);
  const letters = (await op.req("GET", `/api/inquiries/${id}`)).json.letters as { id: string; seq: number; kind: string }[];
  expect(letters.map((l) => [l.seq, l.kind])).toEqual([[1, "SUBMISSION"], [2, "ANSWER"], [3, "SUPPLEMENT"]]);
  await op.ctx.close();
});

test("konto odpowiadającego: tylko przypisane sprawy, reszta API zablokowana, odpowiedź trafia do sprawy, dezaktywacja odcina sesję", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL, "operator12345");
  const acc = await op.req("POST", "/api/inquiries/responders", { email: RESP_EMAIL, firstName: "Roman", lastName: "Odpowiedzialny", functionTitle: "Dyrektor ZDM" });
  expect(acc.status, acc.text).toBe(200);
  expect(acc.json.password).toBeTruthy();
  const respId = acc.json.id;
  expect((await prisma.user.findUniqueOrThrow({ where: { id: respId } })).role).toBe("RESPONDER");
  // Hasło startowe wymaga zmiany - na potrzeby testu ustawiamy znane hasło.
  await prisma.user.update({ where: { id: respId }, data: { passwordHash: await bcrypt.hash(PW, 10), mustChangePassword: false } });

  const mine = await op.req("POST", "/api/inquiries", external("Sprawa dla odpowiadającego"));
  const other = await op.req("POST", "/api/inquiries", external("Sprawa nieprzypisana"));
  created.push(mine.json.id, other.json.id);
  const ad = (await op.req("GET", `/api/inquiries/${mine.json.id}`)).json.addressees[0];
  // Przypisanie wymaga konta odpowiadającego.
  expect((await op.req("PATCH", `/api/inquiries/${mine.json.id}/addressees/${ad.id}`, { responderUserId: ptId })).status).toBe(400);
  const asg = await op.req("PATCH", `/api/inquiries/${mine.json.id}/addressees/${ad.id}`, { forwardedAt: RECEIVED, responderUserId: respId });
  expect(asg.status, asg.text).toBe(200);

  const rs = await login(browser, RESP_EMAIL, PW);
  expect(new URL(rs.page.url()).pathname).toBe("/odpowiedzi");
  const list = await rs.req("GET", "/api/responder/cases");
  expect(list.status).toBe(200);
  expect(list.json.map((c: { id: string }) => c.id)).toEqual([mine.json.id]);
  expect((await rs.req("GET", `/api/responder/cases/${other.json.id}`)).status).toBe(404);
  for (const url of ["/api/inquiries", `/api/inquiries/${mine.json.id}`, "/api/users", "/api/meetings", "/api/info"]) {
    expect((await rs.req("GET", url)).status, url).toBe(403);
  }
  const pdf = await rs.req("GET", `/api/responder/letters/sprawa-${mine.json.id}/pdf`);
  expect(pdf.status).toBe(200);
  const ans = await rs.req("POST", `/api/responder/cases/${mine.json.id}/answers`, { addresseeId: ad.id, body: "Odpowiedź **odpowiadającego**.", submit: true });
  expect(ans.status, ans.text).toBe(200);
  const v = (await op.req("GET", `/api/inquiries/${mine.json.id}`)).json;
  const answer = v.letters.find((l: { kind: string }) => l.kind === "ANSWER");
  expect(answer.state).toBe("FINAL");
  expect(answer.seq).toBe(2);
  expect(v.status).toBe("ANSWERED");
  // Operatorskie trasy niedostępne także z /api/responder dla innych ról.
  expect((await op.req("GET", "/api/responder/cases")).status).toBe(403);
  // Dezaktywacja odcina istniejącą sesję.
  expect((await op.req("PATCH", `/api/inquiries/responders/${respId}`, { active: false })).status).toBe(200);
  expect([401, 403]).toContain((await rs.req("GET", "/api/responder/cases")).status);
  await Promise.all([op.ctx.close(), rs.ctx.close()]);
});

test("informacja: trwałe usunięcie z powiadomieniami; tylko operator", async ({ browser }) => {
  const post = await prisma.infoPost.create({ data: { title: `Do usunięcia ${RUN}`, body: "Treść", status: "PUBLISHED", publishedAt: new Date(), audienceUserIds: [ptId] } });
  await prisma.notification.create({ data: { userId: ptId, kind: "INFO", title: "Nowa informacja", link: `/session/informacje/${post.id}` } });
  const pt = await login(browser, PT_EMAIL, PW);
  expect([401, 403]).toContain((await pt.req("DELETE", `/api/info/${post.id}`)).status);
  const op = await login(browser, OP_EMAIL, "operator12345");
  expect((await op.req("DELETE", `/api/info/${post.id}`)).status).toBe(200);
  expect(await prisma.infoPost.count({ where: { id: post.id } })).toBe(0);
  expect(await prisma.notification.count({ where: { link: `/session/informacje/${post.id}` } })).toBe(0);
  const log = await prisma.auditLog.findFirst({ where: { action: "INFO_POST_CHANGED", metadata: { path: ["postId"], equals: post.id } }, orderBy: { createdAt: "desc" } });
  expect(log?.description).not.toContain(RUN);
  await Promise.all([op.ctx.close(), pt.ctx.close()]);
});

test("funkcja z grupy posiedzenia na liście mówców; bez grupy - funkcja z konta", async ({ browser }) => {
  unitId = (await prisma.orgUnit.create({ data: { name: `Komisja Budżetowa ${RUN}`, kind: "COMMITTEE", members: { create: { userId: ptId, functionName: "Przewodnicząca Komisji" } } } })).id;
  await prisma.meeting.create({ data: { id: MID, number: "7/2026", name: "Posiedzenie komisji", scheduledAt: new Date(), status: "IN_PROGRESS", openedAt: new Date(), orgUnits: { create: { orgUnitId: unitId } } } });
  const mp = await prisma.meetingParticipant.create({ data: { meetingId: MID, userId: ptId, hasVotingRight: true } });
  await prisma.attendance.create({ data: { participantId: mp.id, status: "PRESENT", source: "OPERATOR" } });
  const list = await prisma.speakerList.create({ data: { meetingId: MID, agendaItemId: null, selfSignupEnabled: true } });
  const op = await login(browser, OP_EMAIL, "operator12345");
  const r = await op.req("POST", `/api/speakerlists/${list.id}/entries`, { userId: ptId });
  expect(r.status, r.text).toBe(200);
  expect((await prisma.speakerListEntry.findFirstOrThrow({ where: { speakerListId: list.id, userId: ptId } })).speakerRole).toBe("Przewodnicząca Komisji");
  // Posiedzenie bez powiązania z grupą: funkcja ogólna z konta.
  await prisma.meetingOrgUnit.deleteMany({ where: { meetingId: MID } });
  await prisma.speakerListEntry.deleteMany({ where: { speakerListId: list.id } });
  expect((await op.req("POST", `/api/speakerlists/${list.id}/entries`, { userId: ptId })).status).toBe(200);
  expect((await prisma.speakerListEntry.findFirstOrThrow({ where: { speakerListId: list.id, userId: ptId } })).speakerRole).toBe("Radna");
  await op.ctx.close();
});
