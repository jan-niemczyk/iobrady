import { test, expect, type Browser, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Interpelacje i zapytania: wyłączony moduł blokuje czynności w API, prawo składania nadawane
 * indywidualnie (odebranie działa przy istniejącej sesji, odczyt i PDF zostają), obieg z kilkoma
 * autorami i adresatami, dwie odpowiedzi i ponowienie, równoczesna rejestracja bez duplikatu
 * numeru, PDF z edytora (szkic z oznaczeniem), publikacja wyłącznie wersji publicznej.
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/inquiries.spec.ts
 */

const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const PW = "radny12345";
const OP_EMAIL = `inq-op-${RUN}@test.local`;
const email = (k: string) => `inq-${k}-${RUN}@test.local`;
const uid: Record<string, string> = {};
const created: string[] = [];
let before: { inquiriesEnabled: boolean; inquiriesPublicArchive: boolean; inquiryNumberScope: string } | null = null;

test.describe.configure({ mode: "serial" });
test.use({ launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {} });

type S = Awaited<ReturnType<typeof login>>;
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
    return { status: r.status(), text, json, headers: r.headers(), body: () => r.body() };
  };
  return { ctx, page, req };
}
const setModule = (on: boolean) => prisma.settings.update({ where: { id: "singleton" }, data: { inquiriesEnabled: on } });

test.beforeAll(async () => {
  before = await prisma.settings.findUniqueOrThrow({ where: { id: "singleton" }, select: { inquiriesEnabled: true, inquiriesPublicArchive: true, inquiryNumberScope: true } });
  await prisma.settings.update({ where: { id: "singleton" }, data: { inquiriesEnabled: false, inquiriesPublicArchive: true, inquiryNumberScope: "YEAR" } });
  const hash = await bcrypt.hash(PW, 10);
  await prisma.user.create({ data: { email: OP_EMAIL, passwordHash: await bcrypt.hash("operator12345", 10), firstName: "Operator", lastName: "Rejestru", role: "OPERATOR" } });
  for (const [k, f, l] of [["a", "Anna", "Źródłowska"], ["b", "Bartosz", "Łęcki"], ["c", "Cezary", "Bezprawny"]]) {
    const u = await prisma.user.create({ data: { email: email(k), passwordHash: hash, firstName: f, lastName: l, role: "PARTICIPANT" } });
    uid[k] = u.id;
  }
});

test.afterAll(async () => {
  await prisma.inquiryCase.deleteMany({ where: { id: { in: created } } });
  await prisma.user.deleteMany({ where: { email: { in: [OP_EMAIL, ...["a", "b", "c"].map(email)] } } });
  if (before) await prisma.settings.update({ where: { id: "singleton" }, data: before });
  await prisma.$disconnect();
});

const LONG = Array.from({ length: 40 }, (_, i) => `Akapit ${i + 1}: zażółć gęślą jaźń - treść wydłużająca dokument, aby przeszedł na kolejne strony.`).join("\n");
const BODY = `Wnoszę o udzielenie odpowiedzi na pytania:\n1. Jaki jest **koszt** inwestycji?\n2. Kiedy nastąpi odbiór?\n3. Kto nadzoruje prace?\n${LONG}`;

test("moduł wyłączony i brak prawa: API odrzuca; nadanie umożliwia; odebranie blokuje przy tej samej sesji", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const a = await login(browser, email("a"));
  const c = await login(browser, email("c"));
  const draft = { kind: "INTERPELLATION", title: "Remont ul. Długiej", body: BODY, addressees: [{ name: "Burmistrz Miasta" }] };
  // Moduł wyłączony - nawet z prawem.
  await prisma.inquiryGrant.create({ data: { userId: uid.a } });
  expect((await a.req("POST", "/api/inquiries", draft)).status).toBe(403);
  expect((await op.req("POST", "/api/inquiries", { ...draft, authors: [{ name: "X" }], receivedAt: new Date().toISOString() })).status).toBe(403);
  await setModule(true);
  // Bez prawa (rola radnego, konto, członkostwo nie wystarczą).
  expect((await c.req("POST", "/api/inquiries", draft)).status).toBe(403);
  // Nadanie przez operatora (dziennik).
  const g = await op.req("POST", "/api/inquiries/grants", { userId: uid.c });
  expect(g.status, g.text).toBe(200);
  expect(await prisma.auditLog.count({ where: { action: "INQUIRY_RIGHT_GRANTED", metadata: { path: ["targetUserId"], equals: uid.c } } })).toBe(1);
  const mine = await c.req("POST", "/api/inquiries", { ...draft, title: "Sprawa osoby C" });
  expect(mine.status, mine.text).toBe(200);
  created.push(mine.json.id);
  expect((await c.req("POST", `/api/inquiries/${mine.json.id}/actions`, { action: "submit" })).status).toBe(200);
  // Odebranie przy istniejącej sesji: nowe czynności zablokowane, odczyt i PDF zostają.
  const grant = await prisma.inquiryGrant.findFirstOrThrow({ where: { userId: uid.c } });
  expect((await op.req("DELETE", `/api/inquiries/grants/${grant.id}`)).status).toBe(200);
  expect((await c.req("POST", "/api/inquiries", draft)).status).toBe(403);
  expect((await c.req("POST", `/api/inquiries/${mine.json.id}/letters`, { kind: "SUPPLEMENT", body: "Uzupełnienie", submit: true })).status).toBe(403);
  expect((await c.req("GET", `/api/inquiries/${mine.json.id}`)).status).toBe(200);
  const pdf = await c.req("GET", `/api/inquiries/${mine.json.id}/pdf`);
  expect(pdf.status).toBe(200);
  expect(pdf.headers["content-type"]).toContain("pdf");
  // Zmiana identyfikatora autora nie omija prawa: A (z prawem) nie ma dostępu do sprawy C.
  expect((await a.req("POST", `/api/inquiries/${mine.json.id}/letters`, { kind: "FOLLOWUP", body: "x", submit: true })).status).toBe(404);
  // Wyłączenie modułu blokuje rejestrację u operatora, odczyt zostaje.
  await setModule(false);
  expect((await op.req("POST", `/api/inquiries/${mine.json.id}/actions`, { action: "register" })).status).toBe(403);
  expect((await op.req("GET", `/api/inquiries/${mine.json.id}`)).status).toBe(200);
  expect((await op.req("GET", "/api/inquiries/export?format=xlsx")).status).toBe(200);
  await setModule(true);
  await Promise.all([op.ctx.close(), a.ctx.close(), c.ctx.close()]);
});

test("pełny obieg: współautor, dwaj adresaci, dwie odpowiedzi, ponowienie; PDF szkicu i złożonego", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const a = await login(browser, email("a"));
  const b = await login(browser, email("b"));
  const r = await a.req("POST", "/api/inquiries", {
    kind: "QUESTION", title: "Oświetlenie parku", body: BODY, coAuthorUserIds: [uid.b],
    addressees: [{ name: "Burmistrz Miasta" }, { name: "Dyrektor", institution: "Zarząd Zieleni Miejskiej" }],
  });
  expect(r.status, r.text).toBe(200);
  const id = r.json.id;
  created.push(id);
  // PDF szkicu: dostępny autorowi, z oznaczeniem projektu; nie nadaje numeru ani nie składa.
  const sub = (await a.req("GET", `/api/inquiries/${id}`)).json.letters[0];
  const draftPdf = await a.req("GET", `/api/inquiries/letters/${sub.id}/pdf`);
  expect(draftPdf.status).toBe(200);
  expect((await draftPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await prisma.inquiryCase.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
  // Operator nie widzi szkicu radnego.
  expect((await op.req("GET", `/api/inquiries/${id}`)).status).toBe(404);
  // Współautor bez prawa nie potwierdzi; po nadaniu - potwierdza.
  expect((await a.req("POST", `/api/inquiries/${id}/actions`, { action: "submit" })).status).toBe(200);
  expect((await b.req("POST", `/api/inquiries/${id}/actions`, { action: "confirm-coauthor" })).status).toBe(403);
  await prisma.inquiryGrant.create({ data: { userId: uid.b } });
  expect((await b.req("POST", `/api/inquiries/${id}/actions`, { action: "confirm-coauthor" })).status).toBe(200);
  // Po złożeniu treść nie jest nadpisywana.
  expect((await a.req("PATCH", `/api/inquiries/${id}`, { body: "nowa treść" })).status).toBe(409);

  expect((await op.req("POST", `/api/inquiries/${id}/actions`, { action: "register" })).status).toBe(200);
  const v = (await op.req("GET", `/api/inquiries/${id}`)).json;
  expect(v.number).toMatch(/^\d+\/\d{4}$/);
  expect(v.status).toBe("REGISTERED");
  const [ad1, ad2] = v.addressees;
  for (const ad of [ad1, ad2]) expect((await op.req("PATCH", `/api/inquiries/${id}/addressees/${ad.id}`, { forwardedAt: new Date().toISOString(), dueDate: "2026-12-31" })).status).toBe(200);
  expect((await op.req("GET", `/api/inquiries/${id}`)).json.status).toBe("AWAITING");
  // Odpowiedź pierwszego adresata nie zamyka oczekiwania na drugiego.
  const ans1 = await op.req("POST", `/api/inquiries/${id}/letters`, { kind: "ANSWER", addresseeId: ad1.id, body: "Odpowiedź na pytania 1-3.", receivedAt: new Date().toISOString(), letterDate: new Date().toISOString() });
  expect(ans1.status, ans1.text).toBe(200);
  expect((await op.req("GET", `/api/inquiries/${id}`)).json.status).toBe("PARTIAL");
  // Odpowiedź wyłącznie jako plik (bez treści).
  const ans2 = await op.req("POST", `/api/inquiries/${id}/letters`, { kind: "ANSWER", addresseeId: ad2.id, body: "", receivedAt: new Date().toISOString() });
  expect(ans2.status, ans2.text).toBe(200);
  const up = await op.ctx.request.post(`/api/inquiries/letters/${ans2.json.id}/attachments`, { multipart: { file: { name: "odpowiedz-zzm.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") } }, failOnStatusCode: false });
  expect(up.status(), await up.text()).toBe(200);
  let cur = (await op.req("GET", `/api/inquiries/${id}`)).json;
  expect(cur.status).toBe("ANSWERED");
  expect(cur.closedAt).toBeNull();
  expect(cur.letters.filter((l: { kind: string }) => l.kind === "ANSWER").length).toBe(2);
  // Ponowienie do pierwszego adresata w odniesieniu do jego odpowiedzi: znów oczekiwanie (częściowe).
  const fu = await a.req("POST", `/api/inquiries/${id}/letters`, { kind: "FOLLOWUP", addresseeId: ad1.id, refLetterId: ans1.json.id, body: "Ponawiam pytanie 2:\n1. Kiedy nastąpi odbiór?", submit: true });
  expect(fu.status, fu.text).toBe(200);
  cur = (await a.req("GET", `/api/inquiries/${id}`)).json;
  expect(cur.status).toBe("PARTIAL");
  expect(cur.authors.map((x: { name: string }) => x.name)).toEqual(["Anna Źródłowska", "Bartosz Łęcki"]);
  // PDF pisma i całej sprawy, DOCX.
  for (const url of [`/api/inquiries/letters/${fu.json.id}/pdf`, `/api/inquiries/${id}/pdf`, `/api/inquiries/${id}/docx`]) {
    const f = await a.req("GET", url);
    expect(f.status, url).toBe(200);
  }
  await Promise.all([op.ctx.close(), a.ctx.close(), b.ctx.close()]);
});

test("równoczesna rejestracja: unikalne kolejne numery, ponowna rejestracja odrzucona, ręczny numer zajęty -> 409", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await op.req("POST", "/api/inquiries", { kind: "INTERPELLATION", title: `Pismo zewnętrzne ${i}`, body: "Treść", authors: [{ userId: uid.a, name: "Anna Źródłowska" }], addressees: [{ name: "Burmistrz" }], receivedAt: new Date().toISOString() });
    expect(r.status, r.text).toBe(200);
    ids.push(r.json.id);
    created.push(r.json.id);
  }
  const res = await Promise.all([...ids, ids[0]].map((id) => op.req("POST", `/api/inquiries/${id}/actions`, { action: "register" })));
  expect(res.filter((r) => r.status === 200).length).toBe(6);
  expect(res.filter((r) => r.status === 409).length).toBe(1);
  const rows = await prisma.inquiryCase.findMany({ where: { id: { in: ids } }, select: { seq: true, period: true, enteredById: true, authors: { select: { name: true, confirmation: true } } } });
  const seqs = rows.map((r) => r.seq);
  expect(new Set(seqs).size).toBe(6);
  expect(Math.max(...(seqs as number[])) - Math.min(...(seqs as number[]))).toBe(5);
  // Rzeczywisty autor zachowany, operator jako osoba wprowadzająca.
  expect(rows.every((r) => r.enteredById && r.authors[0].name === "Anna Źródłowska" && r.authors[0].confirmation === "OPERATOR")).toBe(true);
  // Ręczny numer z istniejącego rejestru - zajęty odrzucony.
  const x = await op.req("POST", "/api/inquiries", { kind: "INTERPELLATION", title: "Z dawnego rejestru", body: "T", authors: [{ name: "Jan Spoza" }], addressees: [{ name: "Burmistrz" }], receivedAt: new Date().toISOString() });
  created.push(x.json.id);
  expect((await op.req("POST", `/api/inquiries/${x.json.id}/actions`, { action: "register", manualSeq: seqs[0], manualPeriod: rows[0].period })).status).toBe(409);
  expect((await op.req("POST", `/api/inquiries/${x.json.id}/actions`, { action: "register", manualSeq: 900000, manualPeriod: rows[0].period })).status).toBe(200);
  await op.ctx.close();
});

test("publikacja: publiczny widok i PDF wyłącznie z wersji publicznej; oryginał i plik wewnętrzny niedostępne", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const id = created[1];
  const v = (await op.req("GET", `/api/inquiries/${id}`)).json;
  const sub = v.letters.find((l: { kind: string }) => l.kind === "SUBMISSION");
  const ansFile = v.letters.find((l: { kind: string; body: string }) => l.kind === "ANSWER" && !l.body);
  const internalAtt = ansFile.attachments[0].id;
  // Bez wersji publicznej pisma nie da się opublikować.
  expect((await op.req("PATCH", `/api/inquiries/letters/${sub.id}`, { published: true })).status).toBe(400);
  expect((await op.req("PATCH", `/api/inquiries/letters/${sub.id}`, { published: true, publicBody: "Wnoszę o odpowiedź (wersja publiczna, bez danych prywatnych)." })).status).toBe(200);
  const pubFile = await op.ctx.request.post(`/api/inquiries/letters/${ansFile.id}/attachments`, { multipart: { file: { name: "odpowiedz-anonimizowana.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%anonim\n%%EOF\n") }, public: "1" }, failOnStatusCode: false });
  expect(pubFile.status()).toBe(200);
  const pubAtt = (await pubFile.json()).id;
  expect((await op.req("PATCH", `/api/inquiries/letters/${ansFile.id}`, { published: true })).status).toBe(200);
  expect((await op.req("PATCH", `/api/inquiries/${id}/publication`, { published: true })).status).toBe(200);

  const anon = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  const page = await anon.newPage();
  await page.goto(`/public/interpelacje/${id}`);
  await expect(page.getByText("wersja publiczna, bez danych prywatnych")).toBeVisible();
  await expect(page.getByText("Jaki jest koszt inwestycji")).toHaveCount(0);
  expect((await anon.request.get(`/api/public/inquiries/attachments/${pubAtt}`)).status()).toBe(200);
  expect((await anon.request.get(`/api/public/inquiries/attachments/${internalAtt}`)).status()).toBe(404);
  expect((await anon.request.get(`/api/inquiries/attachments/${internalAtt}`)).status()).not.toBe(200);
  const ppdf = await anon.request.get(`/api/public/inquiries/${id}/pdf`);
  expect(ppdf.status()).toBe(200);
  // Sprawa nieopublikowana - 404 publicznie.
  expect((await anon.request.get(`/api/public/inquiries/${created[0]}/pdf`)).status()).toBe(404);
  await anon.close();
  await op.ctx.close();
});
