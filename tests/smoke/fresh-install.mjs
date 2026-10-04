// Test dymny ŚWIEŻEJ instalacji (pusta baza, kreator /setup nieukończony) - przez przeglądarkę i API:
// kreator, logowanie, konta, posiedzenie, obecność, głosowanie jawne i tajne (czas rzeczywisty),
// załączniki, logo, ekran sali z tokenem, wylogowanie. Tworzy dane syntetyczne - NIE uruchamiać
// na instalacji z prawdziwymi danymi.
//
//   BASE_URL=http://localhost SETUP_TOKEN=$(docker compose logs app | grep -o "kod instalacyjny: [A-Za-z0-9_-]*" | tail -1 | cut -d" " -f3) \
//     node tests/smoke/fresh-install.mjs
// Opcjonalnie: CHROME_PATH (własna przeglądarka), HOST_MAP="obrady.test 127.0.0.1" (nazwa bez DNS).
import { chromium } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

const B = (process.env.BASE_URL || "http://localhost").replace(/\/$/, "");
if (!process.env.SETUP_TOKEN) { console.error("Ustaw SETUP_TOKEN (kod instalacyjny z logu aplikacji)."); process.exit(2); }
const out = [];
const ok = (name, cond, info = "") => { out.push([cond ? "OK  " : "BŁĄD", name, info]); console.log(`[${cond ? "OK  " : "BŁĄD"}] ${name} ${info}`); };
const token = process.env.SETUP_TOKEN;
const args = process.env.HOST_MAP ? [`--host-resolver-rules=MAP ${process.env.HOST_MAP}`] : [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args });
const ctxOpts = { baseURL: B, acceptDownloads: true };
const block = async (page) => page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

// 1. Kreator
const op = await (await browser.newContext(ctxOpts)).newPage(); await block(op);
await op.goto("/");
ok("Nowa instalacja kieruje do kreatora", op.url().includes("/setup"), op.url());
const inputs = op.locator("form input:not([type=file])");
await op.fill("#setup-token", token);
await inputs.nth(1).fill("Rada Testowa Gminy Przykładowo");
await inputs.nth(2).fill("Anna"); await inputs.nth(3).fill("Operatorka");
await inputs.nth(4).fill("admin@obrady.test");
await inputs.nth(5).fill("Haslo-Operatora-2026"); await inputs.nth(6).fill("Haslo-Operatora-2026");
await op.getByRole("button", { name: /Zakończ konfigurację/ }).click();
await op.waitForURL(/login/, { timeout: 15000 });
ok("Kreator: konto operatora utworzone", true);

// 2. Logowanie operatora
await op.fill("#email", "admin@obrady.test"); await op.fill("#password", "Haslo-Operatora-2026");
await op.click("button[type=submit]"); await op.waitForURL(/dashboard/, { timeout: 15000 });
ok("Logowanie operatora", true, op.url());
const cookies = await op.context().cookies();
ok("Ciasteczko sesji dla adresu instalacji (HttpOnly)", cookies.some((c) => c.domain === new URL(B).hostname && /session-token/.test(c.name) && c.httpOnly));
const api = async (method, path, data) => { const r = await op.request.fetch(path, { method, data, failOnStatusCode: false }); let j = null; try { j = await r.json(); } catch {} return { s: r.status(), j }; };

// 3. Użytkownicy (hasła startowe)
const users = [];
for (const [first, last] of [["Ewa", "Radna"], ["Jan", "Radny"], ["Ola", "Radna"]]) {
  const r = await api("POST", "/api/users", { email: `${first.toLowerCase()}@obrady.test`, firstName: first, lastName: last, role: "PARTICIPANT", password: `Start-${first}-12345` });
  users.push({ id: r.j?.id, email: `${first.toLowerCase()}@obrady.test`, pass: `Start-${first}-12345` });
}
ok("Utworzenie 3 kont radnych", users.every((u) => u.id));

// 4. Posiedzenie przez formularz
await op.goto("/meetings/new");
await op.fill("#number", "I/2026"); await op.fill("#name", "I sesja testowa");
await op.fill("#scheduledAt", "2026-10-05T10:00");
await op.getByRole("button", { name: "Utwórz posiedzenie" }).click();
await op.waitForURL((u) => /\/meetings\/[A-Za-z0-9_-]+$/.test(u.pathname) && !u.pathname.endsWith("/new"), { timeout: 15000 });
const mid = op.url().split("/").pop();
ok("Utworzenie posiedzenia", !!mid, mid);
let r = await api("POST", `/api/meetings/${mid}/participants`, { userIds: users.map((u) => u.id) });
ok("Dodanie uczestników", r.s === 200, `status ${r.s}`);
for (const p of ["open", "start"]) { r = await api("POST", `/api/meetings/${mid}/${p}`); ok(`Posiedzenie: ${p}`, r.s === 200, `status ${r.s}`); }
r = await api("POST", `/api/meetings/${mid}/attendance/bulk`, { status: "PRESENT", allEligible: true });
ok("Obecność (operator, wszyscy)", r.s === 200, `status ${r.s}`);

// 5. Radny: wymuszona zmiana hasła i panel
const radCtx = await browser.newContext({ ...ctxOpts, viewport: { width: 390, height: 844 } });
const rad = await radCtx.newPage(); await block(rad);
await rad.goto("/login"); await rad.fill("#email", users[0].email); await rad.fill("#password", users[0].pass); await rad.click("button[type=submit]");
await rad.waitForURL(/account/, { timeout: 15000 });
ok("Radny: hasło startowe -> strona zmiany hasła", rad.url().includes("/account"));
await rad.fill("#pw-current", users[0].pass); await rad.fill("#pw-next", "Wlasne-Haslo-Ewy-1"); await rad.fill("#pw-confirm", "Wlasne-Haslo-Ewy-1");
await rad.getByRole("button", { name: "Zmień hasło" }).click();
await rad.waitForURL((u) => !u.pathname.startsWith("/account"), { timeout: 15000 });
await rad.goto("/session"); await rad.waitForTimeout(2000);
ok("Radny: panel sesji po zmianie hasła", rad.url().includes("/session"));

// 6. Głosowanie jawne - karta pojawia się bez przeładowania (czas rzeczywisty)
r = await api("POST", `/api/meetings/${mid}/votes`, { title: "Przyjęcie porządku obrad", type: "STANDARD", visibility: "OPEN", majorityKind: "SIMPLE", majorityBase: "OF_VOTERS", adHoc: true, openImmediately: true });
const v1 = r.j?.voteId;
const za = rad.getByRole("button", { name: "Za", exact: true });
await za.first().waitFor({ timeout: 15000 });
ok("Karta głosowania pojawia się u radnego bez przeładowania", true);
await za.first().click();
// do 10 s - pierwszy głos po starcie serwera deweloperskiego czeka na kompilację trasy
for (let i = 0; i < 20; i++) { r = await api("GET", `/api/votes/${v1}/counter`); if (r.j?.yes === 1) break; await rad.waitForTimeout(500); }
ok("Głos radnego z karty przyjęty (jawne)", r.j?.yes === 1, `ZA=${r.j?.yes}`);
r = await api("POST", `/api/votes/${v1}/close`); ok("Zamknięcie głosowania jawnego", r.s === 200);

// 7. Głosowanie tajne - rozkład ukryty do zamknięcia
r = await api("POST", `/api/meetings/${mid}/votes`, { title: "Wybór sekretarza", type: "STANDARD", visibility: "SECRET", majorityKind: "SIMPLE", majorityBase: "OF_VOTERS", adHoc: true, openImmediately: true });
const v2 = r.j?.voteId;
await rad.getByText("Wybór sekretarza").first().waitFor({ timeout: 15000 });
await rad.getByRole("button", { name: "Przeciw", exact: true }).first().waitFor({ timeout: 15000 });
await rad.getByRole("button", { name: "Przeciw", exact: true }).first().click();
for (let i = 0; i < 20; i++) { r = await api("GET", `/api/votes/${v2}/counter`); if (r.j?.castCount === 1) break; await rad.waitForTimeout(500); }
ok("Tajne w trakcie: 1 głos, rozkład ukryty, wiadomo kto oddał", r.j?.castCount === 1 && r.j?.no === 0 && (r.j?.votedUserIds ?? []).includes(users[0].id), `oddanych ${r.j?.castCount}, PRZECIW ${r.j?.no}`);
await api("POST", `/api/votes/${v2}/close`);
r = await api("GET", `/api/votes/${v2}/counter`);
ok("Tajne po zamknięciu: wynik dostępny", r.j?.no === 1, `PRZECIW ${r.j?.no}`);

// 8. Załącznik: operator wgrywa, radny pobiera
const tmp = path.join(os.tmpdir(), "iobrady-zalacznik-testowy.pdf");
fs.writeFileSync(tmp, "%PDF-1.4\n% syntetyczny\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const up = await op.request.post(`/api/meetings/${mid}/attachments`, { multipart: { file: { name: "projekt-uchwały.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(tmp) }, visibleToParticipants: "true" }, failOnStatusCode: false });
const att = (await up.json().catch(() => ({})))?.id;
ok("Wgranie załącznika (operator)", up.status() === 200 && !!att, `status ${up.status()}`);
const dl = await rad.request.get(`/api/attachments/${att}/download`, { failOnStatusCode: false });
ok("Pobranie załącznika (radny)", dl.status() === 200 && (await dl.body()).toString().startsWith("%PDF"), `status ${dl.status()}`);
const anonDl = await (await browser.newContext(ctxOpts)).request.get(`/api/attachments/${att}/download`, { failOnStatusCode: false, maxRedirects: 0 });
ok("Załącznik niedostępny bez logowania", anonDl.status() !== 200, `status ${anonDl.status()}`);

// 9. Logo (zapis do wolumenu) i ekran prezentacji z tokenem
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const lg = await op.request.post("/api/settings/logo", { multipart: { file: { name: "logo.png", mimeType: "image/png", buffer: png } }, failOnStatusCode: false });
ok("Wgranie logo (wolumen uploads)", lg.status() === 200, `status ${lg.status()}`);
const state = await api("GET", `/api/meetings/${mid}/state`);
const scr = await (await browser.newContext(ctxOpts)).newPage(); await block(scr);
const noTok = await scr.goto(`/display/${mid}`);
ok("Ekran bez tokenu - brak dostępu", noTok.status() === 404, `status ${noTok.status()}`);
await scr.goto(`/display/${mid}?t=${state.j?.displayToken}`); await scr.waitForTimeout(3000);
const seen = await scr.waitForFunction(() => document.body.innerText.replace(/\u00a0/g, " ").includes("I sesja testowa"), null, { timeout: 15000 }).then(() => true, () => false);
ok("Ekran prezentacji z tokenem", seen, seen ? "" : (await scr.evaluate(() => document.body.innerText)).slice(0, 120).replace(/\n/g, " | "));

// 10. Wylogowanie radnego
await rad.goto("/session");
await rad.getByRole("button", { name: "Wyloguj" }).click(); await rad.waitForURL(/login/, { timeout: 15000 });
const after = await rad.request.get("/api/me/active-votes", { failOnStatusCode: false });
ok("Wylogowanie radnego - sesja nieważna", after.status() === 401, `status ${after.status()}`);

await browser.close();
const bad = out.filter((x) => x[0] !== "OK  ").length;
console.log(`\nWYNIK: ${out.length - bad}/${out.length} OK`);
process.exitCode = bad ? 1 : 0;
