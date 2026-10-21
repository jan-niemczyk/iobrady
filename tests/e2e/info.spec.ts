import { test, expect, type Browser, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Moduł „Informacje”: odbiorcy z kilku grup bez duplikatów, brak dostępu (także do pliku po URL)
 * dla osoby spoza odbiorców i po usunięciu z grupy, odczyt zapisany dopiero przy otwarciu treści,
 * nowa wersja jako nieprzeczytana z zachowaną historią otwarć.
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/info.spec.ts
 */

const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const PW = "radny12345";
const OP_EMAIL = `inf-op-${RUN}@test.local`;
const email = (k: string) => `inf-${k}-${RUN}@test.local`;
const uid: Record<string, string> = {};
const unit: Record<string, string> = {};
let postId = "";
let attId = "";

test.describe.configure({ mode: "serial" });
test.use({ launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {} });

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

test.beforeAll(async () => {
  const hash = await bcrypt.hash(PW, 10);
  await prisma.user.create({ data: { email: OP_EMAIL, passwordHash: await bcrypt.hash("operator12345", 10), firstName: "Operator", lastName: "Informacji", role: "OPERATOR" } });
  for (const k of ["both", "one", "none"]) {
    const u = await prisma.user.create({ data: { email: email(k), passwordHash: hash, firstName: `Radny${k}`, lastName: `Informacyjny${k}`, role: "PARTICIPANT" } });
    uid[k] = u.id;
  }
  for (const k of ["A", "B"]) {
    const o = await prisma.orgUnit.create({ data: { name: `Komisja ${k} ${RUN}`, kind: "COMMITTEE" } });
    unit[k] = o.id;
  }
  await prisma.orgUnitMember.createMany({ data: [
    { orgUnitId: unit.A, userId: uid.both }, { orgUnitId: unit.B, userId: uid.both }, { orgUnitId: unit.B, userId: uid.one },
  ] });
});

test.afterAll(async () => {
  await prisma.infoPost.deleteMany({ where: { id: postId || "-" } });
  await prisma.orgUnit.deleteMany({ where: { id: { in: Object.values(unit) } } });
  await prisma.user.deleteMany({ where: { email: { in: [OP_EMAIL, ...["both", "one", "none"].map(email)] } } });
  await prisma.$disconnect();
});

test("komunikat dla dwóch komisji: raz u osoby z obu, brak u osoby spoza, plik chroniony", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const c = await op.req("POST", "/api/info", { title: `Zaproszenie ${RUN}`, body: "Treść **zaproszenia**.\n- punkt pierwszy", audienceOrgUnitIds: [unit.A, unit.B] });
  expect(c.status, c.text).toBe(200);
  postId = c.json.id;
  const up = await op.ctx.request.post(`/api/info/${postId}/attachments`, {
    multipart: { file: { name: "program.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") } }, failOnStatusCode: false,
  });
  expect(up.status(), await up.text()).toBe(200);
  attId = (await up.json()).id;
  // Szkic nie jest widoczny dla odbiorców.
  const both = await login(browser, email("both"));
  expect((await both.req("GET", `/api/info/${postId}`)).status).toBe(404);
  expect((await op.req("PATCH", `/api/info/${postId}`, { action: "publish" })).status).toBe(200);

  const list = await both.req("GET", "/api/info");
  expect(list.json.filter((p: { id: string }) => p.id === postId).length).toBe(1);
  expect((await both.req("GET", `/api/info/attachments/${attId}`)).status).toBe(200);
  // Jedno powiadomienie mimo dwóch grup.
  expect(await prisma.notification.count({ where: { userId: uid.both, link: `/session/informacje/${postId}` } })).toBe(1);

  const none = await login(browser, email("none"));
  expect((await none.req("GET", "/api/info")).json.some((p: { id: string }) => p.id === postId)).toBe(false);
  expect((await none.req("GET", `/api/info/${postId}`)).status).toBe(404);
  expect((await none.req("GET", `/api/info/attachments/${attId}`)).status).toBe(404);
  expect((await none.req("POST", `/api/info/${postId}/read`)).status).toBe(404);
  await Promise.all([op.ctx.close(), both.ctx.close(), none.ctx.close()]);
});

test("lista nie oznacza przeczytania; otwarcie treści zapisuje odczyt; nowa wersja znów nieprzeczytana", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const one = await login(browser, email("one"));
  await one.req("GET", "/api/info");
  await one.page.goto("/session/informacje");
  await expect(one.page.getByText(`Zaproszenie ${RUN}`)).toBeVisible();
  expect(await prisma.infoRead.count({ where: { postId, userId: uid.one } })).toBe(0);
  expect((await one.req("GET", "/api/info/unread")).json.unread).toBeGreaterThanOrEqual(1);

  await one.page.getByText(`Zaproszenie ${RUN}`).click();
  await expect(one.page.getByRole("heading", { level: 1, name: `Zaproszenie ${RUN}` })).toBeVisible();
  await expect.poll(() => prisma.infoRead.count({ where: { postId, userId: uid.one, version: 1 } })).toBe(1);

  // Poprawka bez nowej wersji - nadal przeczytane; istotna zmiana - wersja 2, nieprzeczytane.
  expect((await op.req("PATCH", `/api/info/${postId}`, { body: "Treść zaproszenia (literówka).", significant: false })).json.version).toBe(1);
  expect((await one.req("GET", `/api/info/${postId}`)).json.unread).toBe(false);
  expect((await op.req("PATCH", `/api/info/${postId}`, { body: "Zmieniony termin.", significant: true })).json.version).toBe(2);
  const after = await one.req("GET", `/api/info/${postId}`);
  expect(after.json.unread).toBe(true);
  expect(after.json.changed).toBe(true);

  const rep = await op.req("GET", `/api/info/${postId}/reads`);
  const row = rep.json.rows.find((r: { userId: string }) => r.userId === uid.one);
  expect(row.readCurrent).toBe(false);
  expect(row.earlierVersions).toEqual([1]);
  expect(rep.json.summary.recipients).toBe(2);
  const x = await op.ctx.request.get(`/api/info/${postId}/reads?format=xlsx`);
  expect(x.headers()["content-type"]).toContain("spreadsheetml");
  await Promise.all([op.ctx.close(), one.ctx.close()]);
});

test("usunięcie z grupy odbiera dostęp do treści i pliku; nowy członek widzi informację", async ({ browser }) => {
  await prisma.orgUnitMember.deleteMany({ where: { orgUnitId: unit.B, userId: uid.one } });
  await prisma.orgUnitMember.create({ data: { orgUnitId: unit.A, userId: uid.none } });
  const one = await login(browser, email("one"));
  const none = await login(browser, email("none"));
  expect((await one.req("GET", `/api/info/${postId}`)).status).toBe(404);
  expect((await one.req("GET", `/api/info/attachments/${attId}`)).status).toBe(404);
  expect((await none.req("GET", `/api/info/${postId}`)).status).toBe(200);
  // Zmiana składu nie tworzy fikcyjnych odczytów.
  expect(await prisma.infoRead.count({ where: { postId, userId: uid.none } })).toBe(0);
  await Promise.all([one.ctx.close(), none.ctx.close()]);
});
