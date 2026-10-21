import { test, expect, type Browser, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import JSZip from "jszip";
import { sortForPosition } from "../../src/lib/reportSort";
import type { ReportPerson } from "../../src/lib/reportTypes";

/**
 * Raporty obecności (2/3, spóźnienie i wyjście bez dodatkowych posiedzeń, „Brak danych” nie jest
 * nieobecnością, gość poza kworum, okres członkostwa, wspólne posiedzenie kilku grup raz),
 * ręczne zakończenie punktu bez godzin, sortowanie pakietu per pozycja, zawiadomienie DOCX.
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/stages.spec.ts
 */

const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const OP_EMAIL = `stg-op-${RUN}@test.local`;
const email = (k: string) => `stg-${k}-${RUN}@test.local`;
const uid: Record<string, string> = {};
const unit: Record<string, string> = {};
const mids: string[] = [];
const T = (d: string, hm: string) => new Date(`${d}T${hm}:00Z`);

test.describe.configure({ mode: "serial" });
test.use({ launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {} });

async function login(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", OP_EMAIL);
  await page.fill("#password", "operator12345");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const req = async (method: string, url: string, data?: unknown) => {
    const r: APIResponse = await ctx.request.fetch(url, { method, data, failOnStatusCode: false });
    const text = await r.text();
    let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { /* tekst */ }
    return { status: r.status(), text, json, body: () => r.body() };
  };
  return { ctx, req };
}

/** Posiedzenie zakończone 10:00-14:00 z uczestnikami i historią obecności. */
async function meeting(day: string, units: string[], people: { userId: string; guest?: boolean; status?: "PRESENT" | "ABSENT"; events?: [string, boolean][] }[]) {
  const id = `stg${RUN}${mids.length}`.slice(0, 16);
  mids.push(id);
  await prisma.meeting.create({ data: { id, number: `S/${mids.length}`, name: `Posiedzenie testowe ${mids.length}`, scheduledAt: T(day, "10:00"), openedAt: T(day, "10:00"), closedAt: T(day, "14:00"), status: "CLOSED" } });
  for (const u of units) await prisma.meetingOrgUnit.create({ data: { meetingId: id, orgUnitId: u } });
  for (const p of people) {
    const mp = await prisma.meetingParticipant.create({ data: { meetingId: id, userId: p.userId, hasVotingRight: !p.guest, isInvitedGuest: !!p.guest } });
    if (p.status) await prisma.attendance.create({ data: { participantId: mp.id, status: p.status, source: "OPERATOR" } });
    for (const [hm, present] of p.events ?? []) await prisma.attendanceEvent.create({ data: { meetingId: id, userId: p.userId, present, at: T(day, hm), source: "OPERATOR" } });
  }
  return id;
}

test.beforeAll(async () => {
  await prisma.user.create({ data: { email: OP_EMAIL, passwordHash: await bcrypt.hash("operator12345", 10), firstName: "Operator", lastName: "Etapów", role: "OPERATOR" } });
  for (const [k, f, l] of [["x", "Xawery", "Obecny"], ["y", "Ygrek", "Punktualny"], ["g", "Gość", "Zaproszony"]]) {
    uid[k] = (await prisma.user.create({ data: { email: email(k), passwordHash: "x", firstName: f, lastName: l, role: "PARTICIPANT" } })).id;
  }
  unit.A = (await prisma.orgUnit.create({ data: { name: `Rada ${RUN}`, kind: "BODY" } })).id;
  unit.B = (await prisma.orgUnit.create({ data: { name: `Komisja ${RUN}`, kind: "COMMITTEE" } })).id;
  await prisma.orgUnitMember.create({ data: { orgUnitId: unit.A, userId: uid.x } });
  await prisma.orgUnitMember.create({ data: { orgUnitId: unit.B, userId: uid.x, validTo: T("2001-02-15", "00:00") } });
  // 1: wspólne posiedzenie A+B, obecny cały czas; gość obecny.
  await meeting("2001-01-10", [unit.A, unit.B], [{ userId: uid.x, status: "PRESENT", events: [["10:00", true]] }, { userId: uid.g, guest: true, status: "PRESENT", events: [["10:00", true]] }]);
  // 2: spóźnienie, wyjście i powrót, wcześniejsze wyjście - nadal jedno posiedzenie, obecność.
  // Druga osoba obecna od otwarcia - spóźnienie liczone od otwarcia, nie od pierwszego wpisu tej osoby.
  await meeting("2001-02-10", [unit.A], [{ userId: uid.x, status: "ABSENT", events: [["10:30", true], ["12:00", false], ["12:30", true], ["13:30", false]] }, { userId: uid.y, status: "PRESENT", events: [["10:00", true]] }]);
  // 3: stwierdzona nieobecność (posiedzenie także komisji, ale po końcu członkostwa w B).
  await meeting("2001-03-10", [unit.A, unit.B], [{ userId: uid.x, status: "ABSENT", events: [["10:00", false]] }]);
  // 4: brak danych o obecności.
  await meeting("2001-03-20", [unit.A], [{ userId: uid.x }]);
});

test.afterAll(async () => {
  await prisma.meeting.deleteMany({ where: { id: { in: mids } } });
  await prisma.orgUnit.deleteMany({ where: { id: { in: Object.values(unit) } } });
  await prisma.user.deleteMany({ where: { email: { in: [OP_EMAIL, email("x"), email("y"), email("g")] } } });
  await prisma.$disconnect();
});

test("obecność: 2/3, spóźnienie i wyjście nie dodają posiedzeń, brak danych nie jest nieobecnością", async ({ browser }) => {
  const op = await login(browser);
  const r = await op.req("GET", `/api/reports/attendance?od=2001-01-01&do=2001-12-31&osoba=${uid.x}`);
  expect(r.status, r.text).toBe(200);
  const row = r.json.rows.find((x: { userId: string }) => x.userId === uid.x);
  expect(row.meetings).toBe(4);
  expect([row.present, row.absent, row.noData]).toEqual([2, 1, 1]);
  expect(row.rate).toBeCloseTo(2 / 3);
  expect([row.late, row.early]).toEqual([1, 1]);
  // Gość nie jest liczony do składu ani kworum.
  const m1 = await op.req("GET", `/api/meetings/${mids[0]}/attendance-report`);
  expect(m1.json.counts.eligible).toBe(1);
  expect(m1.json.guests.length).toBe(1);
  // Dwie grupy: wspólne posiedzenie raz; komisja: tylko w okresie członkostwa.
  const ab = await op.req("GET", `/api/reports/attendance?od=2001-01-01&do=2001-12-31&grupa=${unit.A}&grupa=${unit.B}`);
  expect(ab.json.rows.find((x: { userId: string }) => x.userId === uid.x).meetings).toBe(4);
  const b = await op.req("GET", `/api/reports/attendance?od=2001-01-01&do=2001-12-31&grupa=${unit.B}`);
  expect(b.json.rows.find((x: { userId: string }) => x.userId === uid.x).meetings).toBe(1);
  for (const f of ["pdf", "docx", "xlsx"]) expect((await op.req("GET", `/api/reports/attendance/export?format=${f}&od=2001-01-01&do=2001-12-31`)).status, f).toBe(200);
  await op.ctx.close();
});

test("ręczne zakończenie punktu bez godzin; cofnięcie; zwykłe zakończenie nadal z godzinami", async ({ browser }) => {
  const op = await login(browser);
  const id = `stgm${RUN}`.slice(0, 16);
  mids.push(id);
  await prisma.meeting.create({ data: { id, number: "M/1", name: "Ręczne zakończenie", scheduledAt: new Date(), openedAt: new Date(), status: "IN_PROGRESS" } });
  const [i1, i2] = await Promise.all([1, 2].map((n) => prisma.agendaItem.create({ data: { meetingId: id, order: n, number: String(n), title: `Punkt ${n}` } })));
  expect((await op.req("POST", `/api/agenda/${i2.id}/manual-completion`, { action: "mark" })).status).toBe(200);
  let it = await prisma.agendaItem.findUniqueOrThrow({ where: { id: i2.id } });
  expect([it.status, it.manuallyCompleted, it.startedAt, it.completedAt]).toEqual(["COMPLETED", true, null, null]);
  expect(await prisma.auditLog.count({ where: { action: "AGENDA_ITEM_MARKED_COMPLETED", meetingId: id } })).toBe(1);
  expect((await op.req("POST", `/api/agenda/${i2.id}/manual-completion`, { action: "unmark" })).status).toBe(200);
  it = await prisma.agendaItem.findUniqueOrThrow({ where: { id: i2.id } });
  expect([it.status, it.manuallyCompleted]).toEqual(["PENDING", false]);
  // Bieżący punkt nie może być oznaczony ręcznie; zwykłe zakończenie zapisuje godziny.
  expect((await op.req("POST", `/api/agenda/${i1.id}/start`)).status).toBe(200);
  expect((await op.req("POST", `/api/agenda/${i1.id}/manual-completion`, { action: "mark" })).status).toBe(409);
  expect((await op.req("POST", `/api/agenda/${i1.id}/complete`)).status).toBe(200);
  it = await prisma.agendaItem.findUniqueOrThrow({ where: { id: i1.id } });
  expect(it.status).toBe("COMPLETED");
  expect(it.startedAt).not.toBeNull();
  expect(it.completedAt).not.toBeNull();
  expect(it.manuallyCompleted).toBe(false);
  await op.ctx.close();
});

test("pakiet: osobne sortowanie dla każdej pozycji (kategoria głosu, potem nazwisko z polskimi znakami)", () => {
  const p = (lastName: string, firstName: string, seq: number, perPosition: ReportPerson["perPosition"], present = true): ReportPerson =>
    ({ lastName, firstName, seq, present, mark: present ? "za" : "nb.", perPosition } as ReportPerson);
  const people = [
    p("Łęcka", "Anna", 1, ["pr.", "za"]),
    p("Lis", "Marek", 2, ["za", "pr."]),
    p("Żak", "Ewa", 3, ["za", "ws."]),
    p("Ćwik", "Jan", 4, ["ws.", "za"]),
    p("Adamska", "Ola", 5, ["ng.", "ng."]),
    p("Bąk", "Piotr", 6, undefined, false),
  ];
  const names = (pi: number) => sortForPosition(people, pi).map((x) => x.lastName);
  expect(names(0)).toEqual(["Lis", "Żak", "Łęcka", "Ćwik", "Adamska", "Bąk"]);
  expect(names(1)).toEqual(["Ćwik", "Łęcka", "Lis", "Żak", "Adamska", "Bąk"]);
});

test("zawiadomienie: DOCX ogólny i imienny, edycja porządku nie zmienia posiedzenia, szablon nie przepisuje dokumentu", async ({ browser }) => {
  const op = await login(browser);
  const id = mids[1];
  await Promise.all([1, 2, 3].map((n) => prisma.agendaItem.create({ data: { meetingId: id, order: n, number: String(n), title: `Sprawa ${n}` } })));
  const before = await prisma.agendaItem.findMany({ where: { meetingId: id }, orderBy: { order: "asc" }, select: { title: true, number: true } });
  const t = await op.req("POST", "/api/notice-templates", { name: `Komisja ${RUN}`, orgUnitId: unit.B, content: { title: "ZAWIADOMIENIE", intro: "Na podstawie przepisów zwołuję posiedzenie {{data_posiedzenia}}.", agendaLabel: "Porządek:", agendaPosition: "after-intro", signature: "Przewodniczący\n{{podpisujacy}}", signer: "Jan Nowak", footer: "Biuro Rady", footerPageNumbers: true } });
  expect(t.status, t.text).toBe(200);
  const n = await op.req("POST", `/api/meetings/${id}/notices`, { templateId: t.json.id });
  expect(n.status, n.text).toBe(200);
  const d = (await op.req("GET", `/api/notices/${n.json.id}`)).json;
  const ag = [...d.agenda];
  ag[0] = { ...ag[0], title: "Sprawa 1 - zmieniony tytuł" };
  ag.splice(1, 0, { key: "sub", number: "", title: "Nowy podpunkt", level: 1 });
  ag.pop();
  ag.reverse();
  const recipients = [1, 2].map((i) => ({ key: `m${i}`, source: "manual", name: `Adresat ${i}`, functionTitle: "", institution: "", address: `ul. Prywatna ${i}`, salutation: "" }));
  expect((await op.req("PATCH", `/api/notices/${n.json.id}`, { agenda: ag, recipients })).status).toBe(200);
  // Zmiana szablonu po utworzeniu nie przepisuje zawiadomienia.
  expect((await op.req("PATCH", `/api/notice-templates/${t.json.id}`, { content: { title: "INNY TYTUŁ" } })).status).toBe(200);
  expect((await op.req("GET", `/api/notices/${n.json.id}`)).json.content.title).toBe("ZAWIADOMIENIE");

  const gen = await op.req("GET", `/api/notices/${n.json.id}/docx?tryb=ogolny`);
  expect(gen.status).toBe(200);
  const doc = await (await JSZip.loadAsync(await gen.body())).file("word/document.xml")!.async("string");
  expect(doc).toContain("zmieniony tytuł");
  expect(doc).toContain("Nowy podpunkt");
  expect(doc).not.toContain("Sprawa 3");
  expect(doc.indexOf("Na podstawie")).toBeLessThan(doc.indexOf("Porządek:"));
  expect(doc).toContain("Jan Nowak");
  expect(doc).not.toContain("Adresat 1");
  const zipFiles = await JSZip.loadAsync(await (await op.req("GET", `/api/notices/${n.json.id}/docx?tryb=imienny`)).body());
  const names = Object.keys(zipFiles.files);
  expect(names.length).toBe(2);
  const first = await (await JSZip.loadAsync(await zipFiles.file(names[0])!.async("uint8array"))).file("word/document.xml")!.async("string");
  expect(first).toContain("Adresat 1");
  expect(first).not.toContain("Adresat 2");
  expect(await prisma.agendaItem.findMany({ where: { meetingId: id }, orderBy: { order: "asc" }, select: { title: true, number: true } })).toEqual(before);
  await prisma.noticeTemplate.delete({ where: { id: t.json.id } });
  await op.ctx.close();
});
