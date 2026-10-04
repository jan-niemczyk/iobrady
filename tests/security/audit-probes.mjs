// Sondy bezpieczeństwa (SECURITY_AUDIT.md, sekcja 8) - wersja po wdrożeniu poprawek.
//
// URUCHAMIAĆ WYŁĄCZNIE lokalnie, na syntetycznej bazie testowej (konta *@demo.local).
// Skrypt odmawia działania, jeśli BASE_URL albo DATABASE_URL nie wskazują na localhost.
// Serwer uruchamiać z TRUST_PROXY=true (sondy symulują różne adresy IP nagłówkiem X-Forwarded-For).
// Nie wysyła poczty, nie wykonuje testów obciążeniowych. Hasła kont testowych - ze zmiennych
// środowiskowych, nie są wypisywane.
//
//   SEC_OP_EMAIL=... SEC_OP_PASS=... SEC_PT_PASS=... CHROME_PATH=... node tests/security/audit-probes.mjs
//
// Wynik każdej sondy: OK (zgodnie z regułą) albo BŁĄD. Kategoria mówi, czego dotyczy sonda:
//   NAPRAWA   - podatność usunięta (sonda sprawdza brak podatności),
//   AKCEPT    - zaakceptowane ryzyko / świadoma decyzja (sonda sprawdza, że funkcja DZIAŁA jak dotąd),
//   REGUŁA    - potwierdzona reguła biznesowa,
//   KONTROLA  - kontrola pozytywna integralności.
// Po uruchomieniu bazę testową należy odtworzyć z dumpa (sonda tworzy rekordy syntetyczne).

import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "";
const isLocal = (u) => { try { return ["localhost", "127.0.0.1", "::1"].includes(new URL(u).hostname); } catch { return false; } };
if (!isLocal(BASE) || !isLocal(DB)) { console.error("STOP: BASE_URL i DATABASE_URL muszą wskazywać na localhost."); process.exit(2); }
const OP_EMAIL = process.env.SEC_OP_EMAIL, OP_PASS = process.env.SEC_OP_PASS, PT_PASS = process.env.SEC_PT_PASS;
if (!OP_EMAIL || !OP_PASS || !PT_PASS) { console.error("Ustaw SEC_OP_EMAIL, SEC_OP_PASS, SEC_PT_PASS."); process.exit(2); }

const prisma = new PrismaClient();
const MEETING = process.env.SEC_MEETING_ID ?? "testmeeting00000001";
const results = [];
const check = (id, cat, title, ok, observed) => {
  results.push({ id, cat, title, ok, observed });
  console.log(`[${ok ? "OK  " : "BŁĄD"}] ${cat.padEnd(8)} ${id.padEnd(5)} ${title} :: ${observed}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP z ręczną obsługą ciasteczek i symulowanym IP ───────────────────
class Client {
  constructor(ip = "10.0.0.1") { this.jar = new Map(); this.ip = ip; }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";"); const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (v === "" || /Max-Age=0/i.test(c)) this.jar.delete(k); else this.jar.set(k, v);
    }
  }
  async req(method, path, body, extra = {}) {
    const headers = { cookie: this.cookieHeader(), "x-forwarded-for": this.ip, ...extra };
    let payload;
    if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    this.store(res);
    return res;
  }
  async login(email, password) {
    const r1 = await this.req("GET", "/api/auth/csrf");
    const { csrfToken } = await r1.json();
    const res = await fetch(BASE + "/api/auth/callback/credentials", {
      method: "POST", redirect: "manual",
      headers: { cookie: this.cookieHeader(), "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": this.ip },
      body: new URLSearchParams({ email, password, csrfToken, callbackUrl: BASE + "/" }).toString(),
    });
    this.store(res);
    const loc = res.headers.get("location") ?? "";
    this.lastLoginCode = new URL(loc, BASE).searchParams.get("code");
    return [...this.jar.keys()].some((k) => k.includes("session-token")) && !loc.includes("error");
  }
  async logout() {
    const { csrfToken } = await (await this.req("GET", "/api/auth/csrf")).json();
    const res = await fetch(BASE + "/api/auth/signout", {
      method: "POST", redirect: "manual",
      headers: { cookie: this.cookieHeader(), "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": this.ip },
      body: new URLSearchParams({ csrfToken, callbackUrl: BASE + "/login" }).toString(),
    });
    this.store(res);
  }
}
const json = async (r) => { try { return await r.json(); } catch { return null; } };

async function main() {
  const op = new Client("10.0.0.10");
  if (!(await op.login(OP_EMAIL, OP_PASS))) throw new Error("Logowanie operatora nieudane - sprawdź fixture.");

  const parts = await prisma.meetingParticipant.findMany({
    where: { meetingId: MEETING, hasVotingRight: true, excludedFromMeeting: false, attendance: { status: "PRESENT" } },
    include: { user: true }, orderBy: { user: { lastName: "asc" } },
  });
  if (parts.length < 3) throw new Error("Fixture: potrzeba >= 3 obecnych radnych.");
  const [pA, pB, pC] = parts;
  const A = new Client("10.0.1.1"), B = new Client("10.0.1.2"), C = new Client("10.0.1.3");
  for (const [cl, p] of [[A, pA], [B, pB], [C, pC]]) if (!(await cl.login(p.user.email, PT_PASS))) throw new Error("Logowanie radnego nieudane.");
  await prisma.meeting.update({ where: { id: MEETING }, data: { status: "IN_PROGRESS" } });
  const token = (await prisma.meeting.findUnique({ where: { id: MEETING } })).displayToken;
  const screen = new Client("10.0.9.9"); // ekran sali: bez sesji, tylko token
  const display = (c = screen) => c.req("GET", `/api/display/${MEETING}?t=${encodeURIComponent(token)}`);

  const open = await prisma.vote.findFirst({ where: { meetingId: MEETING, status: "OPEN" } });
  if (open) await op.req("POST", `/api/votes/${open.id}/interrupt`);

  const newVote = async (extra) => {
    const r = await op.req("POST", `/api/meetings/${MEETING}/votes`, {
      title: `SEC-TEST ${extra.visibility} ${Date.now()}`, type: "STANDARD", majorityKind: "SIMPLE", majorityBase: "OF_VOTERS",
      adHoc: true, ...extra,
    });
    const j = await json(r);
    if (!j?.voteId) throw new Error(`Nie utworzono głosowania (${r.status})`);
    return j.voteId;
  };

  // ── SA-03 (zaakceptowane): PIN na ekranie i brak limitu prób ─────────
  {
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    const v = await newVote({ visibility: "OPEN", pinRequired: true, pinCode: pin });
    await op.req("POST", `/api/votes/${v}/open`);
    await op.req("PATCH", `/api/meetings/${MEETING}/display`, { displayPinVoteId: v });
    const d = await json(await display());
    check("S1", "AKCEPT", "PIN na ekranie prezentacji (z tokenem ekranu) - zachowane", d?.pinDisplay?.pin === pin, `pinDisplay.pin ${d?.pinDisplay?.pin === pin ? "== PIN" : "brak"} (wartość nie wypisywana)`);
    const anonNoToken = await new Client("10.0.9.8").req("GET", `/api/display/${MEETING}`);
    check("S1b", "NAPRAWA", "Bez tokenu ekranu i bez sesji: brak danych prezentacji (SA-07)", anonNoToken.status === 404, `status ${anonNoToken.status}`);
    await op.req("PATCH", `/api/meetings/${MEETING}/display`, { displayPinVoteId: null });

    let rejected = 0, blocked = 0;
    const wrong = [...Array(40)].map((_, i) => String(i).padStart(4, "0")).filter((x) => x !== pin).slice(0, 30);
    for (const w of wrong) { const r = await C.req("POST", `/api/votes/${v}/pin-auth`, { pin: w }); if (r.status === 403) rejected++; if (r.status === 429) blocked++; }
    const ok = await C.req("POST", `/api/votes/${v}/pin-auth`, { pin });
    check("S2", "AKCEPT", "pin-auth bez limitu prób - mechanizm PIN bez zmian", blocked === 0 && ok.status === 200, `30 błędnych: ${rejected}x403, ${blocked}x429; poprawny: ${ok.status}`);

    const forOther = await A.req("POST", `/api/votes/${v}/cast`, { choice: "YES", onBehalfUserId: pB.userId });
    check("C1", "KONTROLA", "Radny nie może głosować za innego", forOther.status === 403, `status ${forOther.status}`);
    await A.req("POST", `/api/votes/${v}/pin-auth`, { pin });
    const par = await Promise.all([...Array(8)].map(() => A.req("POST", `/api/votes/${v}/cast`, { choice: "YES" })));
    const nBallots = await prisma.ballot.count({ where: { voteId: v, userId: pA.userId } });
    check("C2", "KONTROLA", "8 równoległych głosów jednej osoby - jedna karta", nBallots === 1, `statusy ${[...new Set(par.map((r) => r.status))].join(",")}; kart: ${nBallots}`);

    // SA-02 (zaakceptowane): głos/zerowanie w imieniu w jawnym działa jak dotąd
    const ob = await op.req("POST", `/api/votes/${v}/cast`, { choice: "NO", onBehalfUserId: pB.userId });
    const reset = await op.req("POST", `/api/votes/${v}/cast`, { reset: true, onBehalfUserId: pB.userId });
    const ob2 = await op.req("POST", `/api/votes/${v}/cast`, { choice: "ABSTAIN", onBehalfUserId: pB.userId });
    check("S5", "AKCEPT", "Operator: głos i zerowanie w imieniu (jawne) - działa bez zmian", [ob, reset, ob2].every((r) => r.status === 200), `cast/reset/cast: ${ob.status}/${reset.status}/${ob2.status}`);

    // BR-2: głosowanie jawne jest jawne
    const ctr = await json(await C.req("GET", `/api/votes/${v}/counter`));
    check("S9", "REGUŁA", "Jawne: radny widzi imienne głosy w trakcie (BR-2)", !!ctr?.castByUser?.[pA.userId], `castByUser zawiera cudzy głos: ${!!ctr?.castByUser?.[pA.userId]}`);

    // BR-1: wyniki od razu po zamknięciu, brak funkcji wstrzymania
    const hold = await op.req("PATCH", `/api/meetings/${MEETING}`, { holdResults: true });
    const holdDb = (await prisma.meeting.findUnique({ where: { id: MEETING } })).holdResults;
    await op.req("POST", `/api/votes/${v}/close`);
    const rep = await C.req("GET", `/api/votes/${v}/participant-report`);
    const pub = await op.req("POST", `/api/votes/${v}/publish`, { published: false });
    check("S10", "REGUŁA", "Wyniki dostępne od razu po zamknięciu; wstrzymanie usunięte (BR-1)", rep.status === 200 && holdDb === false && pub.status === 404,
      `participant-report ${rep.status}; PATCH holdResults ${hold.status} (zapisane: ${holdDb}); /publish ${pub.status}`);
    const late = await B.req("POST", `/api/votes/${v}/cast`, { choice: "YES" });
    check("C3", "KONTROLA", "Głos po zamknięciu odrzucony", late.status >= 400, `status ${late.status}`);
  }

  // ── SA-01: tajne (zwykłe) - brak rozkładu do zamknięcia, "oddał/nie oddał" zachowane ──
  {
    const v = await newVote({ visibility: "SECRET" });
    await op.req("POST", `/api/votes/${v}/open`);
    const mpB = await prisma.meetingParticipant.findFirst({ where: { meetingId: MEETING, userId: pB.userId } });
    await op.req("PATCH", `/api/meeting-participants/${mpB.id}`, { isChairperson: true });
    const c0 = await json(await B.req("GET", `/api/chairperson/${MEETING}`));
    const castA = await A.req("POST", `/api/votes/${v}/cast`, { choice: "NO" });
    const d1 = await json(await display());
    const c1 = await json(await B.req("GET", `/api/chairperson/${MEETING}`));
    const ctrP = await json(await C.req("GET", `/api/votes/${v}/counter`));
    const ctrO = await json(await op.req("GET", `/api/votes/${v}/counter`));
    const csv = await op.req("GET", `/api/votes/${v}/report.csv`);
    const rd = await op.req("GET", `/api/meetings/${MEETING}/report-data?vote=${v}`);
    const tally = (x) => [x?.yes, x?.no, x?.abstain, x?.invalid].map((n) => n ?? 0).reduce((a, b) => a + b, 0);
    const dv = d1?.activeVote;
    const names0 = new Set((c0?.activeVote?.notVoted ?? []).map((x) => x.name));
    const names1 = new Set((c1?.activeVote?.notVoted ?? []).map((x) => x.name));
    const gone = [...names0].filter((n) => !names1.has(n)).length;
    check("S3", "NAPRAWA", "Tajne w trakcie: brak rozkładu dla ekranu, radnego i operatora (SA-01)",
      castA.status === 200 && (dv?.resultYes ?? 0) + (dv?.resultNo ?? 0) + (dv?.resultAbstain ?? 0) === 0 && tally(ctrP) === 0 && tally(ctrO) === 0 && csv.status === 409 && rd.status === 409,
      `ekran ZA/PRZ/WSTRZ=${dv?.resultYes}/${dv?.resultNo}/${dv?.resultAbstain}; licznik radnego=${tally(ctrP)}, operatora=${tally(ctrO)}; CSV ${csv.status}, report-data ${rd.status}`);
    check("S3b", "NAPRAWA", "Tajne w trakcie: liczba oddanych i \"oddał/nie oddał\" zachowane",
      dv?.resultCastCount === 1 && ctrO?.castCount === 1 && gone === 1 && (ctrO?.votedUserIds ?? []).includes(pA.userId) && ctrP?.votedUserIds === undefined,
      `oddanych: ekran ${dv?.resultCastCount}, operator ${ctrO?.castCount}; lista "nie głosowali" -${gone}; operator widzi kto oddał: ${(ctrO?.votedUserIds ?? []).includes(pA.userId)}; radny nie dostaje listy: ${ctrP?.votedUserIds === undefined}`);

    // Zerowanie głosu tajnego (nowa funkcja) - bez ujawnienia treści
    const auditBefore = await prisma.auditLog.count({ where: { action: "VOTE_BALLOT_RESET" } });
    const byPt = await B.req("POST", `/api/votes/${v}/cast`, { reset: true, onBehalfUserId: pA.userId });
    const rs = await op.req("POST", `/api/votes/${v}/cast`, { reset: true, onBehalfUserId: pA.userId });
    const rsBody = await rs.text();
    const after = await json(await op.req("GET", `/api/votes/${v}/counter`));
    const recast = await A.req("POST", `/api/votes/${v}/cast`, { choice: "YES" });
    const auditAfter = await prisma.auditLog.findFirst({ where: { action: "VOTE_BALLOT_RESET" }, orderBy: { createdAt: "desc" } });
    check("S13", "NAPRAWA", "Zerowanie głosu tajnego: tylko operator, bez treści, możliwy ponowny głos",
      byPt.status === 403 && rs.status === 200 && after?.castCount === 0 && recast.status === 200 && !/YES|NO|ABSTAIN|ZA|PRZECIW/.test(rsBody)
        && (await prisma.auditLog.count({ where: { action: "VOTE_BALLOT_RESET" } })) === auditBefore + 1 && !/YES|NO|ABSTAIN/.test(JSON.stringify(auditAfter?.metadata ?? {})),
      `radny ${byPt.status}; operator ${rs.status}; oddanych po zerowaniu ${after?.castCount}; ponowny głos ${recast.status}; audyt bez treści`);
    await op.req("PATCH", `/api/meeting-participants/${mpB.id}`, { isChairperson: false });
    await B.req("POST", `/api/votes/${v}/cast`, { choice: "NO" });

    // Wyścig zamknięcia z oddawaniem głosu
    const racers = [C].map((cl) => cl.req("POST", `/api/votes/${v}/cast`, { choice: "YES" }));
    const closing = op.req("POST", `/api/votes/${v}/close`);
    const rsx = await Promise.all([...racers, closing]);
    const fin = await prisma.vote.findUnique({ where: { id: v }, include: { _count: { select: { secretMarkers: true } } } });
    const sum = fin.secretYes + fin.secretNo + fin.secretAbstain + fin.secretInvalid;
    check("C4", "KONTROLA", "Wyścig cast vs close - liczniki zgodne z markerami", sum === fin._count.secretMarkers,
      `statusy ${rsx.map((r) => r.status).join("/")}; suma=${sum}, markery=${fin._count.secretMarkers}`);
    const payloads = await prisma.secretBallotMarker.count({ where: { voteId: v, resetPayload: { not: null } } });
    const resetAfterClose = await op.req("POST", `/api/votes/${v}/cast`, { reset: true, onBehalfUserId: pB.userId });
    check("S13b", "NAPRAWA", "Po zamknięciu: brak zaszyfrowanych treści głosów, zerowanie niemożliwe", payloads === 0 && resetAfterClose.status >= 400, `payloady: ${payloads}; zerowanie po zamknięciu: ${resetAfterClose.status}`);
    const d2 = await json(await display());
    const lc = [d2?.pinnedVote, d2?.lastClosedVote].find((x) => x?.id === v);
    const rep2 = await json(await C.req("GET", `/api/votes/${v}/participant-report`));
    check("S3c", "NAPRAWA", "Tajne po zamknięciu: wynik od razu (ekran i raport radnego)",
      lc?.id === v && (lc.resultYes + lc.resultNo) === sum && !!rep2,
      `ekran ZA/PRZ=${lc?.resultYes}/${lc?.resultNo} (suma ważnych ${sum}); raport radnego: ${rep2 ? "tak" : "nie"}`);
  }

  // ── SA-01: tryb kotarkowy - to samo maskowanie, frekwencja zachowana ──
  {
    const v = await newVote({ visibility: "SECRET", boothMode: true });
    await op.req("POST", `/api/votes/${v}/open`);
    await op.req("POST", `/api/votes/${v}/booth`, { action: "grant", userId: pA.userId });
    const cast = await A.req("POST", `/api/votes/${v}/cast`, { choice: "YES" });
    const ctrO = await json(await op.req("GET", `/api/votes/${v}/counter`));
    const dv = (await json(await display()))?.activeVote;
    check("S3d", "NAPRAWA", "Kotarka: brak rozkładu, liczba oddanych i kto oddał zachowane",
      cast.status === 200 && ctrO?.yes === 0 && ctrO?.castCount === 1 && (ctrO?.votedUserIds ?? []).includes(pA.userId) && (dv?.resultYes ?? 0) === 0 && dv?.resultCastCount === 1,
      `cast ${cast.status}; operator ZA=${ctrO?.yes}, oddanych=${ctrO?.castCount}; ekran ZA=${dv?.resultYes}, oddanych=${dv?.resultCastCount}`);
    await op.req("POST", `/api/votes/${v}/close`);
  }

  // ── BR-3: dwa głosowania naraz w tym samym posiedzeniu / cykl życia / dwa posiedzenia ──
  {
    const v1 = await newVote({ visibility: "OPEN" }), v2 = await newVote({ visibility: "OPEN" });
    const rs = await Promise.all([op.req("POST", `/api/votes/${v1}/open`), op.req("POST", `/api/votes/${v2}/open`)]);
    const openCount = await prisma.vote.count({ where: { meetingId: MEETING, status: "OPEN" } });
    check("S14", "NAPRAWA", "Równoległe otwarcie dwóch głosowań w jednym posiedzeniu - otwarte jedno", openCount === 1, `statusy ${rs.map((r) => r.status).join("/")}; otwartych: ${openCount}`);
    for (const v of [v1, v2]) await op.req("POST", `/api/votes/${v}/interrupt`);

    const m2 = await prisma.meeting.create({ data: { id: `secm2${Date.now()}`.slice(0, 16), number: "SEC/2", name: "SEC-TEST drugie posiedzenie", scheduledAt: new Date(), status: "IN_PROGRESS", displayToken: `tok${Date.now()}xxxxxxxxxxxx` } });
    const mpA2 = await prisma.meetingParticipant.create({ data: { meetingId: m2.id, userId: pA.userId, hasVotingRight: true } });
    await prisma.attendance.create({ data: { participantId: mpA2.id, status: "PRESENT", source: "OPERATOR" } });
    const onlyM2 = await prisma.user.create({ data: { email: `sec-only-m2-${Date.now()}@demo.local`, firstName: "Tylko", lastName: "Drugie", passwordHash: (await prisma.user.findUnique({ where: { id: pC.userId } })).passwordHash, role: "PARTICIPANT" } });
    const mpY = await prisma.meetingParticipant.create({ data: { meetingId: m2.id, userId: onlyM2.id } });
    await prisma.attendance.create({ data: { participantId: mpY.id, status: "PRESENT", source: "OPERATOR" } });
    const va = await newVote({ visibility: "OPEN" });
    const rb = await op.req("POST", `/api/meetings/${m2.id}/votes`, { title: "SEC-TEST m2", type: "STANDARD", visibility: "OPEN", majorityKind: "SIMPLE", majorityBase: "OF_VOTERS", adHoc: true, openImmediately: true });
    const vb = (await json(rb))?.voteId;
    await op.req("POST", `/api/votes/${va}/open`);
    const av = await json(await A.req("GET", "/api/me/active-votes"));
    const ca = await A.req("POST", `/api/votes/${va}/cast`, { choice: "YES" });
    const cb = await A.req("POST", `/api/votes/${vb}/cast`, { choice: "NO" });
    const rosterB = await prisma.voteRoster.count({ where: { voteId: vb } });
    check("S15", "REGUŁA", "Jedna osoba w dwóch trwających posiedzeniach głosuje w obu (BR-3)",
      ca.status === 200 && cb.status === 200 && (av?.votes ?? []).length >= 2,
      `aktywne karty: ${(av?.votes ?? []).length}; głos w 1: ${ca.status}, w 2: ${cb.status}`);
    check("S15b", "NAPRAWA", "\"Utwórz i otwórz\" przechodzi pełną ścieżkę otwarcia (migawka składu)", rb.status === 200 && rosterB > 0, `utworzenie ${rb.status}; wpisów migawki: ${rosterB}`);

    // Zamknięcie posiedzenia z wylogowaniem radnych - osoba w innym trwającym posiedzeniu zostaje
    await op.req("PATCH", "/api/settings", { logoutParticipantsOnMeetingClose: true });
    await op.req("POST", `/api/votes/${vb}/close`);
    const Y = new Client("10.0.1.9");
    await Y.login(onlyM2.email, PT_PASS);
    const yBefore = await Y.req("GET", "/api/me/active-votes");
    const cl = await op.req("POST", `/api/meetings/${m2.id}/close`);
    await sleep(6000); // cache sesji 5 s
    const aAfter = await A.req("GET", "/api/me/active-votes");
    const yAfter = await Y.req("GET", "/api/me/active-votes");
    check("S16", "NAPRAWA", "Zamknięcie posiedzenia wylogowuje tylko radnych bez innego trwającego posiedzenia",
      cl.status === 200 && aAfter.status === 200 && yBefore.status === 200 && yAfter.status === 401,
      `zamknięcie ${cl.status}; radny w 2 posiedzeniach: ${aAfter.status}; radny tylko w zamkniętym: ${yBefore.status} -> ${yAfter.status}`);
    await op.req("PATCH", "/api/settings", { logoutParticipantsOnMeetingClose: false });
    const inClosed = await newVote({ visibility: "OPEN" }).then(async () => {
      const r = await op.req("POST", `/api/meetings/${m2.id}/votes`, { title: "SEC po zamknięciu", type: "STANDARD", visibility: "OPEN", majorityKind: "SIMPLE", majorityBase: "OF_VOTERS", adHoc: true, openImmediately: true });
      return r.status;
    });
    check("S17", "NAPRAWA", "Nie da się otworzyć głosowania w zamkniętym posiedzeniu", inClosed === 400, `status ${inClosed}`);
    await op.req("POST", `/api/votes/${va}/close`);
  }

  // ── SA-07: ekran prezentacji / nakładka OBS ──────────────────────────
  {
    const draft = await prisma.meeting.create({ data: { id: `secd${Date.now()}`.slice(0, 16), number: "SEC/1", name: "SEC-TEST szkic", scheduledAt: new Date(Date.now() + 864e5), status: "DRAFT", displayToken: `drafttok${Date.now()}xxxxxxx` } });
    const anon = new Client("10.0.9.7");
    const noTok = await anon.req("GET", `/api/display/${draft.id}`);
    const badTok = await anon.req("GET", `/api/display/${draft.id}?t=zly-token-1234567890`);
    const goodTok = await anon.req("GET", `/api/display/${draft.id}?t=${draft.displayToken}`);
    const page = await anon.req("GET", `/overlay/${draft.id}`);
    const pageTok = await new Client("10.0.9.6").req("GET", `/overlay/${draft.id}?t=${draft.displayToken}`);
    const cookieSet = (pageTok.headers.getSetCookie?.() ?? []).some((c) => c.startsWith(`iob_dt_${draft.id}=`) && /HttpOnly/i.test(c));
    const memberC = await C.req("GET", `/api/display/${MEETING}`);
    check("S4", "NAPRAWA", "Prezentacja/nakładka tylko z tokenem ekranu albo sesją uczestnika (SA-07)",
      noTok.status === 404 && badTok.status === 404 && goodTok.status === 200 && page.status === 404 && pageTok.status === 200 && cookieSet && memberC.status === 200,
      `API: bez tokenu ${noTok.status}, zły ${badTok.status}, dobry ${goodTok.status}; nakładka: bez ${page.status}, z tokenem ${pageTok.status} (ciasteczko HttpOnly: ${cookieSet}); radny posiedzenia ${memberC.status}`);
    const rot = await json(await op.req("POST", `/api/meetings/${draft.id}/display-token`));
    const old = await anon.req("GET", `/api/display/${draft.id}?t=${draft.displayToken}`);
    const fresh = await anon.req("GET", `/api/display/${draft.id}?t=${rot?.displayToken}`);
    check("S4b", "NAPRAWA", "Nowy link ekranu unieważnia stary", old.status === 404 && fresh.status === 200, `stary ${old.status}, nowy ${fresh.status}`);
    const cc = (await display()).headers.get("cache-control");
    check("S4c", "NAPRAWA", "Odpowiedź prezentacji nie trafia do cache pośrednich", /no-store/.test(cc ?? ""), `Cache-Control: ${cc}`);

    // SA-08
    const before = await prisma.speakerList.count({ where: { meetingId: draft.id } });
    const fm = await C.req("GET", `/api/meetings/${draft.id}/formal-motions`);
    const afterL = await prisma.speakerList.count({ where: { meetingId: draft.id } });
    check("S6", "NAPRAWA", "formal-motions: obcy radny nie czyta i nic nie zapisuje (SA-08)", fm.status === 404 && afterL === before, `status ${fm.status}; nowe listy: ${afterL - before}`);
    const sse = await C.req("GET", `/api/meetings/${draft.id}/stream`);
    check("C5", "KONTROLA", "SSE cudzego posiedzenia odrzucone", sse.status === 403, `status ${sse.status}`);
    try { await sse.body?.cancel(); } catch {}
  }

  // ── SA-04: odwołanie sesji, wylogowanie, bezczynność ──────────────────
  {
    const tmpPass = `Tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    await op.req("POST", "/api/users", { email: `sec-op-${Date.now()}@demo.local`, firstName: "Sec", lastName: "Operator", role: "OPERATOR", password: tmpPass });
    const created = await prisma.user.findFirst({ where: { firstName: "Sec", lastName: "Operator" }, orderBy: { createdAt: "desc" } });
    await prisma.user.update({ where: { id: created.id }, data: { mustChangePassword: false } });
    const X = new Client("10.0.2.1");
    await X.login(created.email, tmpPass);
    const ok0 = await X.req("GET", "/api/users");
    await op.req("PATCH", `/api/users/${created.id}`, { role: "PARTICIPANT" });
    const afterDemote = await X.req("GET", "/api/users");
    check("S7", "NAPRAWA", "Zmiana roli natychmiast kończy sesję (SA-04)", ok0.status === 200 && afterDemote.status === 401, `przed ${ok0.status}, po degradacji ${afterDemote.status}`);
    await op.req("PATCH", `/api/users/${created.id}`, { role: "OPERATOR" });
    const X2 = new Client("10.0.2.1"); await X2.login(created.email, tmpPass);
    await op.req("DELETE", `/api/users/${created.id}`);
    const afterDeact = await X2.req("GET", "/api/users");
    check("S7b", "NAPRAWA", "Dezaktywacja natychmiast kończy sesję", afterDeact.status === 401, `status ${afterDeact.status}`);

    const L = new Client("10.0.2.2"); await L.login(pC.user.email, PT_PASS);
    const copied = L.cookieHeader();
    await L.logout();
    const reuse = await fetch(BASE + "/api/me/active-votes", { headers: { cookie: copied, "x-forwarded-for": "10.0.2.2" }, redirect: "manual" });
    check("S7c", "NAPRAWA", "Skopiowane ciasteczko po wylogowaniu jest nieważne", reuse.status === 401, `status ${reuse.status}`);

    // Bezczynność: odpytywanie i SSE NIE przedłużają sesji; aktywność użytkownika - tak.
    await op.req("PATCH", "/api/settings", { sessionIdleMinutes: 1 });
    const I = new Client("10.0.2.3"); await I.login(pC.user.email, PT_PASS);
    const sess = await prisma.userSession.findFirst({ where: { userId: pC.userId, revokedAt: null }, orderBy: { createdAt: "desc" } });
    await prisma.userSession.update({ where: { id: sess.id }, data: { lastActivityAt: new Date(Date.now() - 45_000) } });
    const stream = await I.req("GET", `/api/meetings/${MEETING}/stream`);
    for (let i = 0; i < 3; i++) await I.req("GET", `/api/votes/${(await prisma.vote.findFirst({ where: { meetingId: MEETING } })).id}/counter`);
    try { await stream.body?.cancel(); } catch {}
    const la = (await prisma.userSession.findUnique({ where: { id: sess.id } })).lastActivityAt;
    const pollingNotActivity = Date.now() - la.getTime() >= 44_000;
    await prisma.userSession.update({ where: { id: sess.id }, data: { lastActivityAt: new Date(Date.now() - 120_000) } });
    await sleep(5500);
    const idle = await I.req("GET", "/api/me/active-votes");
    const J = new Client("10.0.2.4"); await J.login(pC.user.email, PT_PASS);
    const sessJ = await prisma.userSession.findFirst({ where: { userId: pC.userId, revokedAt: null }, orderBy: { createdAt: "desc" } });
    await prisma.userSession.update({ where: { id: sessJ.id }, data: { lastActivityAt: new Date(Date.now() - 50_000) } });
    const act = await J.req("POST", "/api/session/activity");
    const laJ = (await prisma.userSession.findUnique({ where: { id: sessJ.id } })).lastActivityAt;
    check("S18", "NAPRAWA", "Bezczynność: SSE/odpytywanie nie przedłużają sesji; aktywność użytkownika tak",
      pollingNotActivity && idle.status === 401 && act.status === 204 && Date.now() - laJ.getTime() < 5_000,
      `po SSE i 3 odpytaniach lastActivity bez zmian: ${pollingNotActivity}; po przekroczeniu limitu ${idle.status}; /api/session/activity ${act.status} odświeża: ${Date.now() - laJ.getTime() < 5_000}`);
    await op.req("PATCH", "/api/settings", { sessionIdleMinutes: 240 });
  }

  // ── SA-05: limity logowania (wspólny IP sali), enumeracja ────────────
  {
    // 25 radnych logujących się poprawnie z JEDNEGO publicznego IP - bez blokad.
    const hash = (await prisma.user.findUnique({ where: { id: pC.userId } })).passwordHash;
    const stamp = Date.now();
    const many = [];
    for (let i = 0; i < 25; i++) many.push(await prisma.user.create({ data: { email: `sec-hall-${stamp}-${i}@demo.local`, firstName: "Sala", lastName: `Radny${i}`, passwordHash: hash, role: "PARTICIPANT" } }));
    let okHall = 0;
    for (const u of many) { if (await new Client("10.5.5.5").login(u.email, PT_PASS)) okHall++; }
    // literówki kilku osób z tej samej sali (po 3 błędy) nie blokują innych
    for (const u of many.slice(0, 5)) for (let k = 0; k < 3; k++) await new Client("10.5.5.5").login(u.email, "zle-haslo");
    const otherStillOk = await new Client("10.5.5.5").login(many[10].email, PT_PASS);
    check("S8", "NAPRAWA", "Wspólny IP sali: 25 poprawnych logowań + literówki bez blokowania innych", okHall === 25 && otherStillOk, `udane: ${okHall}/25; inne konto po literówkach: ${otherStillOk}`);

    const victim = many[20];
    let blockedCode = null;
    for (let k = 0; k < 8; k++) await new Client("10.6.6.6").login(victim.email, `zle-${k}`);
    const att = new Client("10.6.6.6"); const correctFromAttacker = await att.login(victim.email, PT_PASS); blockedCode = att.lastLoginCode;
    const fromOtherIp = await new Client("10.7.7.7").login(victim.email, PT_PASS);
    const locked = await prisma.auditLog.count({ where: { action: "LOGIN_LOCKED" } });
    const failed = await prisma.loginAttempt.count({ where: { email: victim.email, success: false } });
    check("S8b", "NAPRAWA", "Seria błędów z jednego IP blokuje tę parę konto+IP, nie właściciela z innego IP",
      !correctFromAttacker && blockedCode === "rate_limited" && fromOtherIp && locked > 0 && failed >= 8,
      `poprawne hasło z IP atakującego: ${correctFromAttacker} (kod ${blockedCode}); właściciel z innego IP: ${fromOtherIp}; wpisy LOGIN_LOCKED: ${locked}; zapisane nieudane próby: ${failed}`);

    const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const tK = [], tU = [];
    for (let i = 0; i < 9; i++) {
      let t = performance.now(); await new Client(`10.8.${i}.1`).login(many[22].email, `zle-${i}`); tK.push(performance.now() - t);
      t = performance.now(); await new Client(`10.8.${i}.2`).login(`nieistnieje-${i}@demo.local`, `zle-${i}`); tU.push(performance.now() - t);
    }
    check("S8c", "NAPRAWA", "Czas odpowiedzi nie zdradza istnienia konta", Math.abs(med(tK) - med(tU)) < 30, `mediana istniejące ${med(tK).toFixed(0)} ms, nieistniejące ${med(tU).toFixed(0)} ms`);

    // Wymuszona zmiana hasła startowego (konto utworzone przez operatora)
    const startPass = `Start-${stamp}-x`;
    const cr = await json(await op.req("POST", "/api/users", { email: `sec-new-${stamp}@demo.local`, firstName: "Nowy", lastName: "Radny", role: "PARTICIPANT", password: startPass }));
    const N = new Client("10.9.9.1"); await N.login(`sec-new-${stamp}@demo.local`, startPass);
    const blockedApi = await N.req("GET", "/api/me/active-votes");
    const blockedPage = await N.req("GET", "/session");
    const chg = await N.req("POST", "/api/account/password", { currentPassword: startPass, newPassword: `Nowe-${stamp}-haslo` });
    await sleep(100);
    const afterChange = await N.req("GET", "/api/me/active-votes");
    check("S19", "NAPRAWA", "Hasło startowe: przed zmianą tylko strona konta; po zmianie normalna praca",
      !!cr?.id && blockedApi.status === 403 && (blockedPage.headers.get("location") ?? "").includes("/account") && chg.status === 200 && afterChange.status === 200,
      `API przed ${blockedApi.status}; strona -> ${blockedPage.headers.get("location")}; zmiana ${chg.status}; API po ${afterChange.status}`);
    const short = await op.req("POST", "/api/users", { email: `sec-short-${stamp}@demo.local`, firstName: "K", lastName: "H", password: "1234567" });
    check("S19b", "NAPRAWA", "Hasło krótsze niż 8 znaków odrzucone", short.status === 400, `status ${short.status}`);
  }

  // ── SA-10, BR-5, CSRF, CSV, nagłówki, SMTP ───────────────────────────
  {
    const z = await op.req("PATCH", "/api/users/nonexistent", { email: 123 });
    const zt = await z.text();
    check("S11", "NAPRAWA", "Błąd walidacji bez szczegółów technicznych (SA-10)", z.status === 400 && !zt.includes("[") && !/Expected|invalid_type/i.test(zt), `status ${z.status}; treść: "${zt.slice(0, 40)}"`);
    const chair = await op.req("POST", "/api/users", { email: `sec-chair-${Date.now()}@demo.local`, firstName: "P", lastName: "Q", role: "CHAIRPERSON", autoGenerate: true });
    const imp = await json(await op.req("POST", "/api/users/import", { rows: [{ firstName: "Sec", lastName: "Import", email: `sec-imp-${Date.now()}@demo.local`, role: "CHAIRPERSON" }] }));
    const chairCount = await prisma.$queryRaw`SELECT count(*)::int AS n FROM "User" WHERE role::text = 'CHAIRPERSON'`;
    check("S20", "REGUŁA", "Brak globalnej roli CHAIRPERSON (BR-5)", chair.status === 400 && imp?.results?.[0]?.status === "error" && chairCount[0].n === 0,
      `utworzenie: ${chair.status}; import: ${imp?.results?.[0]?.status}; konta z tą rolą: ${chairCount[0].n}`);
    const csrf = await op.req("POST", `/api/meetings/${MEETING}/messages`, { content: "x" }, { origin: "https://evil.invalid" });
    check("S21", "NAPRAWA", "Żądanie zmieniające stan z obcej domeny odrzucone (CSRF)", csrf.status === 403, `status ${csrf.status}`);
    const v = await newVote({ visibility: "OPEN", title: "=HYPERLINK(\"http://x.invalid\",\"klik\")" });
    await op.req("POST", `/api/votes/${v}/open`); await op.req("POST", `/api/votes/${v}/close`);
    const csv = await (await op.req("GET", `/api/meetings/${MEETING}/reports/votes.csv`)).text();
    check("S22", "NAPRAWA", "CSV: formuły zneutralizowane", csv.includes(`"'=HYPERLINK`) && !csv.includes(`"=HYPERLINK`), `zawiera "'=HYPERLINK": ${csv.includes(`"'=HYPERLINK`)}`);
    await op.req("PATCH", "/api/settings", { smtpPassword: "syntetyczne-haslo-smtp" });
    const html = await (await op.req("GET", "/settings")).text();
    const db = (await prisma.settings.findUnique({ where: { id: "singleton" } })).smtpPassword ?? "";
    const auditLeak = await prisma.$queryRaw`SELECT count(*)::int AS n FROM "AuditLog" WHERE metadata::text LIKE '%syntetyczne-haslo-smtp%'`;
    check("S23", "NAPRAWA", "Hasło SMTP: zaszyfrowane, nie trafia do przeglądarki ani dziennika (SA-11)",
      !html.includes("syntetyczne-haslo-smtp") && db.startsWith("enc:v1:") && auditLeak[0].n === 0,
      `w HTML: ${html.includes("syntetyczne-haslo-smtp")}; w bazie zaszyfrowane: ${db.startsWith("enc:v1:")}; w dzienniku: ${auditLeak[0].n}`);
    await op.req("PATCH", "/api/settings", { smtpPasswordClear: true });
    const r = await new Client().req("GET", "/login");
    const h = (k) => r.headers.get(k);
    check("S24", "NAPRAWA", "Nagłówki: CSP, nosniff, XFO, bez X-Powered-By", !!h("content-security-policy") && h("x-content-type-options") === "nosniff" && !!h("x-frame-options") && !h("x-powered-by"),
      `CSP=${!!h("content-security-policy")}, nosniff=${h("x-content-type-options")}, XFO=${h("x-frame-options")}, x-powered-by=${h("x-powered-by") ?? "brak"}`);
    const s1 = await new Client().req("POST", "/api/setup", { setupToken: "x", email: "a@b.local", password: "12345678", organizationName: "x" });
    check("S25", "NAPRAWA", "Kreator /setup zamknięty po konfiguracji (SA-09)", s1.status === 403, `status ${s1.status}`);
  }

  // ── Limit API prezentacji (900/min na IP) - wiele ekranów jednej sali mieści się z zapasem ──
  {
    const hall = new Client("10.3.3.3");
    let ok = 0, limited = 0;
    for (let i = 0; i < 905; i++) {
      const r = await hall.req("GET", `/api/display/${MEETING}?t=${encodeURIComponent(token)}`);
      if (r.status === 200) ok++; else if (r.status === 429) limited++;
    }
    const other = await new Client("10.3.3.4").req("GET", `/api/display/${MEETING}?t=${encodeURIComponent(token)}`);
    check("S26", "NAPRAWA", "API prezentacji: limit na IP, inne IP bez wpływu", ok === 900 && limited === 5 && other.status === 200,
      `z jednego IP: ${ok}x200, ${limited}x429; inne IP: ${other.status}`);
  }

  // ── SA-06: otwarte przekierowanie (przeglądarka, ruch zewnętrzny blokowany) + CSP w przeglądarce ──
  {
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let attempted = null;
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.host !== new URL(BASE).host && !/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) { attempted = `${u.protocol}//${u.host}`; return route.abort(); }
      if (/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return route.abort();
      return route.continue();
    });
    for (const target of ["https://attacker.invalid/phish", "//attacker.invalid/x", "/\\attacker.invalid"]) {
      await page.goto(`${BASE}/login?from=${encodeURIComponent(target)}`);
      await page.fill("#email", pB.user.email); await page.fill("#password", PT_PASS);
      await page.click("button[type=submit]");
      await page.waitForTimeout(2500);
      await ctx.clearCookies();
    }
    check("S12", "NAPRAWA", "Brak otwartego przekierowania po zalogowaniu (SA-06)", attempted === null, `próba wyjścia poza aplikację: ${attempted ?? "brak"}`);
    await browser.close();
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\nPODSUMOWANIE: ${results.length - bad.length}/${results.length} OK${bad.length ? `; BŁĘDY: ${bad.map((r) => r.id).join(", ")}` : ""}`);
  if (bad.length) process.exitCode = 1;
}

main().catch((e) => { console.error("BŁĄD:", e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
