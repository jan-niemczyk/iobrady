import { test, expect, type Browser, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Tryb kotarkowy (głosowanie tajne, jedna kabina) - scenariusze serwera, współbieżności i UI.
 *
 * Test sam zakłada odizolowane posiedzenie i konta (przez Prismę, DATABASE_URL) i usuwa je na końcu,
 * więc nie zależy od seedu. Uruchomienie (najlepiej na buildzie produkcyjnym - `npm run build`):
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/booth-mode.spec.ts
 * Własna przeglądarka (np. w kontenerze): PW_CHROMIUM_PATH=/ścieżka/do/chrome.
 */

const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const MID = `booth${RUN}`.slice(0, 16);
const PW = "radny12345";
const OP_EMAIL = `booth-op-${RUN}@test.local`;
const PEOPLE = [
  { key: "E", first: "Ewa", last: "Zielińska", present: true },
  { key: "A", first: "Anna", last: "Kowalska", present: true },
  { key: "M", first: "Michalina", last: "Bosak", present: true },
  { key: "K", first: "Miłosz", last: "Król", present: true },
  { key: "J", first: "Jan", last: "Nowak", present: false },
] as const;
type Key = (typeof PEOPLE)[number]["key"];
const email = (k: Key) => `booth-${k.toLowerCase()}-${RUN}@test.local`;
const uid: Record<string, string> = {};

test.describe.configure({ mode: "serial" });
test.use({ launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {} });

type Session = Awaited<ReturnType<typeof login>>;
async function login(browser: Browser, mail: string, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
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
  return { ctx, page, req, errors };
}

async function createVote(op: Session, body: { title: string; boothMode?: boolean; visibility?: string; type?: string; options?: { label: string }[]; minSelections?: number; maxSelections?: number }) {
  return op.req("POST", `/api/meetings/${MID}/votes`, {
    title: body.title, type: body.type ?? "STANDARD", visibility: body.visibility ?? "SECRET",
    majorityKind: "SIMPLE", majorityBase: "OF_VOTERS", boothMode: body.boothMode, openImmediately: false,
    options: body.options ?? [], minSelections: body.minSelections, maxSelections: body.maxSelections,
  });
}
async function openBoothVote(op: Session, title: string, extra: Partial<Parameters<typeof createVote>[1]> = {}) {
  const r = await createVote(op, { title, boothMode: true, ...extra });
  expect(r.status, r.text).toBe(200);
  expect((await op.req("POST", `/api/votes/${r.json.voteId}/open`)).status).toBe(200);
  return r.json.voteId as string;
}
const grant = (op: Session, voteId: string, k: Key) => op.req("POST", `/api/votes/${voteId}/booth`, { action: "grant", userId: uid[k] });
const revoke = (op: Session, voteId: string, k: Key) => op.req("POST", `/api/votes/${voteId}/booth`, { action: "revoke", userId: uid[k] });
const markers = (voteId: string, k?: Key) => prisma.secretBallotMarker.count({ where: { voteId, ...(k ? { userId: uid[k] } : {}) } });
const vote = (voteId: string) => prisma.vote.findUniqueOrThrow({ where: { id: voteId } });

test.beforeAll(async () => {
  const hash = await bcrypt.hash(PW, 10);
  await prisma.user.create({ data: { email: OP_EMAIL, passwordHash: await bcrypt.hash("operator12345", 10), firstName: "Operator", lastName: "Testu", role: "OPERATOR" } });
  await prisma.meeting.create({ data: { id: MID, number: `T/${RUN}`, name: "Sesja testowa trybu kotarkowego", scheduledAt: new Date(), status: "IN_PROGRESS", openedAt: new Date() } });
  const item = await prisma.agendaItem.create({ data: { meetingId: MID, order: 1, number: "1", title: "Punkt testowy", status: "CURRENT", startedAt: new Date() } });
  await prisma.meeting.update({ where: { id: MID }, data: { currentAgendaItemId: item.id } });
  await prisma.speakerList.create({ data: { meetingId: MID, agendaItemId: item.id, selfSignupEnabled: true } });
  for (const p of PEOPLE) {
    const u = await prisma.user.create({ data: { email: email(p.key), passwordHash: hash, firstName: p.first, lastName: p.last, role: "PARTICIPANT" } });
    uid[p.key] = u.id;
    const mp = await prisma.meetingParticipant.create({ data: { meetingId: MID, userId: u.id, hasVotingRight: true } });
    await prisma.attendance.create({ data: { participantId: mp.id, status: p.present ? "PRESENT" : "ABSENT", source: "OPERATOR" } });
  }
});

test.afterAll(async () => {
  await prisma.meeting.deleteMany({ where: { id: MID } });
  await prisma.user.deleteMany({ where: { email: { in: [OP_EMAIL, ...PEOPLE.map((p) => email(p.key))] } } });
  await prisma.$disconnect();
});

test("ustawienie trybu: tylko tajne bez kworum, domyślnie wyłączony, bez zmiany w trakcie", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  expect((await createVote(op, { title: "Jawne", visibility: "OPEN", boothMode: true })).status).toBe(400);
  expect((await createVote(op, { title: "Kworum", type: "QUORUM", boothMode: true })).status).toBe(400);
  const plain = await createVote(op, { title: "Bez trybu" });
  expect((await vote(plain.json.voteId)).boothMode).toBe(false);
  await op.req("DELETE", `/api/votes/${plain.json.voteId}`);
  const V = await openBoothVote(op, "Ustawienie");
  expect((await op.req("PATCH", `/api/votes/${V}`, { boothMode: false })).status).toBe(400);
  expect((await vote(V)).boothMode).toBe(true);
  await op.req("POST", `/api/votes/${V}/close`);
});

test("serwer: dostęp tylko po udostępnieniu, jeden głos, bez wyników cząstkowych", async ({ browser }) => {
  test.setTimeout(120_000);
  const op = await login(browser, OP_EMAIL);
  const E = await login(browser, email("E"));
  const A = await login(browser, email("A"));
  const V = await openBoothVote(op, "Reguły serwera");

  // brak dostępu
  expect((await E.req("POST", `/api/votes/${V}/cast`, { choice: "YES" })).status).toBe(403);
  expect((await E.req("GET", "/api/me/active-votes")).json.votes).toHaveLength(0);
  const s0 = (await E.req("GET", `/api/me/session?m=${MID}`)).json;
  expect(s0.activeVote).toBeNull();
  expect(s0.booth).toMatchObject({ granted: false, voted: false, canVote: true });
  expect((await A.req("POST", `/api/votes/${V}/booth`, { action: "grant", userId: uid.A })).status).toBe(403);
  expect((await A.req("GET", `/api/votes/${V}/booth`)).status).toBe(403);
  expect((await grant(op, V, "J")).status).toBe(409); // nieobecny

  // udostępnienie i głos
  expect((await grant(op, V, "E")).status).toBe(200);
  expect((await grant(op, V, "A")).status).toBe(409); // kabina zajęta
  expect((await A.req("POST", `/api/votes/${V}/cast`, { choice: "NO" })).status).toBe(403);
  const av = (await E.req("GET", "/api/me/active-votes")).json.votes;
  expect(av).toHaveLength(1);
  expect((await E.req("POST", `/api/votes/${V}/cast`, { choice: "YES" })).status).toBe(200);
  const dup = await E.req("POST", `/api/votes/${V}/cast`, { choice: "NO" });
  expect(dup.status).toBe(409);
  expect(dup.text).toContain("już przyjęty");
  expect((await vote(V)).boothUserId).toBeNull();
  expect((await revoke(op, V, "E")).status).toBe(409);
  expect((await grant(op, V, "E")).status).toBe(409);

  // brak wyników cząstkowych (operator, uczestnik, prezentacja, raporty)
  const c = (await op.req("GET", `/api/votes/${V}/counter`)).json;
  expect(c).toMatchObject({ masked: true, yes: 0, no: 0, abstain: 0, castCount: 1 });
  expect((await A.req("GET", `/api/votes/${V}/counter`)).json.yes).toBe(0);
  expect(JSON.stringify((await op.req("GET", `/api/display/${MID}`)).json)).not.toContain('"resultYes":1');
  expect((await op.req("GET", `/api/meetings/${MID}/report-data?vote=${V}`)).status).toBe(409);
  expect((await op.req("GET", `/api/votes/${V}/report.csv`)).status).toBe(409);

  // cofnięcie i ponowne udostępnienie
  expect((await grant(op, V, "A")).status).toBe(200);
  expect((await revoke(op, V, "A")).status).toBe(200);
  expect((await A.req("POST", `/api/votes/${V}/cast`, { choice: "NO" })).status).toBe(403);
  expect((await grant(op, V, "A")).status).toBe(200);
  expect((await A.req("POST", `/api/votes/${V}/cast`, { choice: "NO" })).status).toBe(200);

  // dziennik bez treści głosów
  const logs = await prisma.auditLog.findMany({ where: { meetingId: MID, action: { in: ["VOTE_BOOTH_GRANTED", "VOTE_BOOTH_REVOKED"] } } });
  expect(logs.length).toBeGreaterThan(0);
  expect(JSON.stringify(logs.map((l) => l.metadata))).not.toMatch(/YES|"NO"|ABSTAIN|choice/);

  // zamknięcie przy udostępnionej karcie unieważnia udostępnienie; wynik zgodny ze znacznikami
  expect((await grant(op, V, "M")).status).toBe(200);
  expect((await op.req("POST", `/api/votes/${V}/close`)).status).toBe(200);
  const M = await login(browser, email("M"));
  expect([400, 409]).toContain((await M.req("POST", `/api/votes/${V}/cast`, { choice: "YES" })).status);
  const closed = await vote(V);
  expect(closed.boothUserId).toBeNull();
  expect(closed.resultYes! + closed.resultNo! + closed.resultAbstain!).toBe(await markers(V));
  expect((await op.req("GET", `/api/votes/${V}/counter`)).json.masked).toBe(false);
});

test("współbieżność: dwóch operatorów, podwójne wysłanie, cofnięcie vs głos, zamknięcie vs głos", async ({ browser }) => {
  test.setTimeout(240_000);
  const op = await login(browser, OP_EMAIL);
  const op2 = await login(browser, OP_EMAIL);
  const K = await login(browser, email("K"));
  const M = await login(browser, email("M"));

  // dwóch operatorów udostępnia naraz różnym osobom - wygrywa dokładnie jeden
  const V = await openBoothVote(op, "Współbieżność");
  const [g1, g2] = await Promise.all([grant(op, V, "K"), grant(op2, V, "M")]);
  expect([g1.status, g2.status].sort()).toEqual([200, 409]);
  const holder = (await vote(V)).boothUserId;
  if (holder !== uid.K) { await revoke(op, V, "M"); await grant(op, V, "K"); }

  // 5 równoległych wysłań - przyjęty dokładnie jeden głos
  const many = await Promise.all([1, 2, 3, 4, 5].map(() => K.req("POST", `/api/votes/${V}/cast`, { choice: "ABSTAIN" })));
  expect(many.filter((r) => r.status === 200)).toHaveLength(1);
  expect(await markers(V, "K")).toBe(1);
  expect((await vote(V)).secretAbstain).toBe(1);
  await op.req("POST", `/api/votes/${V}/close`);

  // cofnięcie vs wysłanie: każde rozstrzygnięcie musi być spójne
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const VR = await openBoothVote(op, `Wyścig cofnięcia ${i}`);
    await grant(op, VR, "M");
    const d = Math.floor(Math.random() * 60);
    const later = <T,>(fn: () => Promise<T>) => new Promise((r) => setTimeout(r, d)).then(fn);
    const doRevoke = () => revoke(op2, VR, "M");
    const doCast = () => M.req("POST", `/api/votes/${VR}/cast`, { choice: "YES" });
    const [rv, cs] = i % 2 ? await Promise.all([doRevoke(), later(doCast)]) : await Promise.all([later(doRevoke), doCast()]);
    const v = await vote(VR);
    expect(v.boothUserId).toBeNull();
    if (cs.status === 200) { expect(rv.status).toBe(409); expect(await markers(VR)).toBe(1); expect(v.secretYes).toBe(1); seen.add("głos"); }
    else { expect(cs.status).toBe(403); expect(rv.status).toBe(200); expect(await markers(VR)).toBe(0); expect(v.secretYes).toBe(0); seen.add("cofnięcie"); }
    await op.req("POST", `/api/votes/${VR}/close`);
  }
  console.log("cofnięcie vs głos - zaobserwowane rozstrzygnięcia:", [...seen].join(", "));

  // zamknięcie vs wysłanie: głos albo policzony, albo odrzucony - nigdy "przyjęty poza wynikiem"
  for (let i = 0; i < 6; i++) {
    const VC = await openBoothVote(op, `Wyścig zamknięcia ${i}`);
    await grant(op, VC, "M");
    const d = Math.floor(Math.random() * 80);
    const [cs, cl] = await Promise.all([
      M.req("POST", `/api/votes/${VC}/cast`, { choice: "YES" }),
      new Promise((r) => setTimeout(r, d)).then(() => op.req("POST", `/api/votes/${VC}/close`)),
    ]);
    expect(cl.status).toBe(200);
    const v = await vote(VC);
    const n = await markers(VC);
    if (cs.status === 200) { expect(n).toBe(1); expect(v.resultYes).toBe(1); expect(v.resultCastCount).toBe(1); }
    else { expect(cs.status).toBe(409); expect(n).toBe(0); expect(v.resultYes).toBe(0); }
  }
});

test("UI: pełny przebieg, cofnięcie czyści wybór, potwierdzenie bez treści", async ({ browser }) => {
  test.setTimeout(180_000);
  const op = await login(browser, OP_EMAIL, { width: 1440, height: 900 });
  const E = await login(browser, email("E"));
  const A = await login(browser, email("A"));
  const row = (name: string) => op.page.locator('[aria-label="Uprawnieni do głosowania"] li', { hasText: name });

  const V = await openBoothVote(op, "Wybór delegata");
  await E.page.goto("/session");
  await A.page.goto("/session");
  const wait = E.page.getByText("Poczekaj na wywołanie i udostępnienie głosowania");
  await expect(wait).toBeVisible();
  expect((await wait.boundingBox())!.y).toBeLessThan(844); // na telefonie bez przewijania
  await expect(E.page.getByRole("button", { name: "Za", exact: true })).toHaveCount(0);

  await op.page.goto(`/meetings/${MID}`);
  await expect(op.page.getByText("Kabina wolna")).toBeVisible();
  await row("Zielińska").getByRole("button", { name: "Udostępnij" }).click();
  await expect(op.page.getByText("Karta udostępniona:")).toBeVisible();
  await expect(row("Zielińska").getByText("Głosowanie udostępniono")).toBeVisible();
  await expect(row("Kowalska").getByRole("button", { name: "Udostępnij" })).toBeDisabled();

  await E.page.getByRole("button", { name: "Za", exact: true }).click({ timeout: 10_000 }); // karta pojawia się sama
  await expect(E.page.getByText("Głos został przyjęty.")).toBeVisible();
  await expect(E.page.getByRole("button", { name: "Za", exact: true })).toHaveCount(0);
  await expect(E.page.getByText("Oddano głos")).toHaveCount(0);
  await expect(E.page.locator("main")).not.toContainText(/\bZa\b|\bZA\b|Przeciw|PRZECIW|Wstrzym/);
  await expect(A.page.getByText("Poczekaj na wywołanie")).toBeVisible();
  await expect(row("Zielińska").getByText("Głos oddany")).toBeVisible();
  await expect(op.page.getByText("Kabina wolna")).toBeVisible();
  await E.page.reload();
  await expect(E.page.getByText("Głos został przyjęty.")).toBeVisible(); // stan z serwera
  await op.req("POST", `/api/votes/${V}/close`);

  // lista: zaznaczenie, cofnięcie, ponowne udostępnienie -> wybór wyczyszczony
  const VL = await openBoothVote(op, "Wybór komisji", { type: "LIST", options: [{ label: "Adam Lis" }, { label: "Beata Sowa" }, { label: "Cezary Kruk" }], minSelections: 1, maxSelections: 2 });
  await op.page.reload();
  await row("Kowalska").getByRole("button", { name: "Udostępnij" }).click();
  await A.page.getByText("Beata Sowa").click({ timeout: 10_000 });
  await row("Kowalska").getByRole("button", { name: "Cofnij udostępnienie" }).click();
  await expect(A.page.getByText("Beata Sowa")).toHaveCount(0, { timeout: 10_000 });
  await expect(A.page.getByText("Poczekaj na wywołanie")).toBeVisible();
  await row("Kowalska").getByRole("button", { name: "Udostępnij" }).click();
  const send = A.page.getByRole("button", { name: /Zatwierdź i wyślij/ });
  await expect(send).toBeDisabled({ timeout: 10_000 }); // min. 1 wybór, a wybór został wyczyszczony
  await A.page.getByText("Cezary Kruk").click();
  await send.click();
  await expect(A.page.getByText("Głos został przyjęty.")).toBeVisible();
  await op.req("POST", `/api/votes/${VL}/close`);
});

test("UI: druga zakładka, utrata odpowiedzi, telefon offline, zamknięcie z udostępnioną kartą", async ({ browser }) => {
  test.setTimeout(180_000);
  const op = await login(browser, OP_EMAIL, { width: 1440, height: 900 });
  const E = await login(browser, email("E"));
  const A = await login(browser, email("A"));
  const K = await login(browser, email("K"));
  const M = await login(browser, email("M"));
  const V = await openBoothVote(op, "Przerwania");

  // druga zakładka ze starą, otwartą kartą
  const tab2 = await E.ctx.newPage();
  await E.page.goto("/session");
  await tab2.goto("/session");
  await grant(op, V, "E");
  await expect(tab2.getByRole("button", { name: "Za", exact: true })).toBeVisible({ timeout: 10_000 });
  await tab2.route("**/api/me/active-votes", (r) => r.abort()); // zamrożona karta
  await E.page.getByRole("button", { name: "Przeciw", exact: true }).click({ timeout: 10_000 });
  await expect(E.page.getByText("Głos został przyjęty.")).toBeVisible();
  await tab2.getByRole("button", { name: "Za", exact: true }).click();
  await expect(tab2.getByText(/został już przyjęty/)).toBeVisible();
  await expect(tab2.getByText("Oddano głos")).toHaveCount(0);
  await tab2.unroute("**/api/me/active-votes");
  await expect(tab2.getByText("Głos został przyjęty.")).toBeVisible({ timeout: 10_000 });
  expect(await markers(V, "E")).toBe(1);

  // utrata odpowiedzi: serwer przyjmuje głos, telefon nie dostaje odpowiedzi
  await grant(op, V, "A");
  await A.page.goto("/session");
  let delivered = 0;
  let done!: () => void;
  const handled = new Promise<void>((r) => { done = r; });
  await A.page.route("**/cast", async (route) => {
    delivered = (await route.fetch()).status();
    await route.abort("connectionreset");
    done();
  });
  await A.page.getByRole("button", { name: "Za", exact: true }).click({ timeout: 10_000 });
  await handled;
  expect(delivered).toBe(200);
  await expect(A.page.getByText("Oddano głos")).toHaveCount(0);
  await A.page.unroute("**/cast");
  await expect(A.page.getByText("Głos został przyjęty.")).toBeVisible({ timeout: 15_000 });
  expect(await markers(V, "A")).toBe(1);
  expect((await vote(V)).secretYes).toBe(1);
  expect(A.errors).toEqual([]);

  // telefon offline: brak fałszywego sukcesu, po powrocie sieci karta nadal udostępniona
  await K.page.goto("/session");
  await grant(op, V, "K");
  const abstain = K.page.getByRole("button", { name: "Wstrzymuję się", exact: true });
  await expect(abstain).toBeVisible({ timeout: 10_000 });
  await K.ctx.setOffline(true);
  await abstain.click();
  await expect(K.page.getByText("Brak potwierdzenia z serwera")).toBeVisible();
  await expect(K.page.getByText("Głos został przyjęty.")).toHaveCount(0);
  expect(await markers(V, "K")).toBe(0);
  await K.ctx.setOffline(false);
  await expect(abstain).toBeVisible({ timeout: 15_000 });
  await abstain.click();
  await expect(K.page.getByText("Głos został przyjęty.")).toBeVisible();
  expect(K.errors).toEqual([]);

  // panel operatora po odświeżeniu + ostrzeżenie przy zamknięciu z udostępnioną kartą
  await grant(op, V, "M");
  await M.page.goto("/session");
  await expect(M.page.getByRole("button", { name: "Za", exact: true })).toBeVisible({ timeout: 10_000 });
  await op.page.goto(`/meetings/${MID}`);
  await expect(op.page.getByText("Karta udostępniona:")).toBeVisible();
  // Okno potwierdzenia aplikacji (bez natywnych okien przeglądarki).
  let nativeDialogs = 0;
  op.page.on("dialog", (d) => { nativeDialogs++; void d.dismiss(); });
  const closeBtn = op.page.getByRole("button", { name: "Zamknij głosowanie", exact: true }).first();
  const dlg = op.page.locator(".modal-content", { hasText: "Zamknąć głosowanie?" });
  await closeBtn.click();
  await expect(dlg).toContainText("nadal udostępniona");
  await expect(dlg).toContainText("Bosak");
  await dlg.getByRole("button", { name: "Anuluj" }).click();
  await expect(dlg).toHaveCount(0);
  await op.page.waitForTimeout(500);
  expect((await vote(V)).status).toBe("OPEN");
  await closeBtn.click();
  await dlg.locator(".btn-danger").click();
  expect(nativeDialogs).toBe(0);
  await expect.poll(async () => (await vote(V)).status, { timeout: 15_000 }).toBe("CLOSED");
  expect((await vote(V)).boothUserId).toBeNull();
  await expect(M.page.getByRole("button", { name: "Za", exact: true })).toHaveCount(0, { timeout: 10_000 });
});

test("regresja: tajne bez trybu kotarkowego - jeden głos, rozkład dopiero po zamknięciu", async ({ browser }) => {
  const op = await login(browser, OP_EMAIL);
  const E = await login(browser, email("E"));
  const r = await createVote(op, { title: "Tajne zwykłe" });
  const V = r.json.voteId;
  await op.req("POST", `/api/votes/${V}/open`);
  expect((await E.req("GET", "/api/me/active-votes")).json.votes).toHaveLength(1);
  expect((await E.req("POST", `/api/votes/${V}/cast`, { choice: "YES" })).status).toBe(200);
  expect((await E.req("POST", `/api/votes/${V}/cast`, { choice: "YES" })).status).toBe(409);
  // SA-01: w KAŻDYM głosowaniu tajnym rozkład dopiero po zamknięciu - także dla operatora;
  // liczba oddanych głosów dostępna w trakcie.
  expect((await op.req("GET", `/api/votes/${V}/counter`)).json).toMatchObject({ masked: true, yes: 0, castCount: 1 });
  expect((await op.req("POST", `/api/votes/${V}/close`)).status).toBe(200);
  expect((await op.req("GET", `/api/votes/${V}/counter`)).json).toMatchObject({ masked: false, yes: 1, castCount: 1 });
});

test("lista mówców: „Zapisz się” na całą szerokość, pozostałe dzielą wiersz po równo", async ({ browser }) => {
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 1366, height: 768 }]) {
    const E = await login(browser, email("E"), viewport);
    await E.page.goto("/session");
    const z = (await E.page.getByRole("button", { name: "+ Zapisz się" }).boundingBox())!;
    const w = (await E.page.getByRole("button", { name: "+ Wniosek formalny" }).boundingBox())!;
    const a = (await E.page.getByRole("button", { name: "+ Ad vocem" }).boundingBox())!;
    expect(z.width).toBeGreaterThan(w.width);
    expect(w.y).toBeGreaterThan(z.y);
    expect(Math.abs(w.y - a.y)).toBeLessThan(2);
    expect(Math.abs(w.width - a.width)).toBeLessThan(4);
    await E.ctx.close();
  }
});
