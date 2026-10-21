/**
 * Scenariusz danych syntetycznych do sprawdzenia widoków i obliczeń (nie dla produkcji).
 *   DATABASE_URL=... npx tsx tests/fixtures/scenario.ts [--clubs]
 * Tworzy: 40 radnych (w tym dwie osoby o identycznym imieniu i nazwisku), kluby (opcjonalnie),
 * grupy organizacyjne (rada + dwie komisje z częściowo wspólnym składem), dawny szablon składu,
 * zakończone posiedzenie z porządkiem (podpunkty, punkt bez numeru), głosowaniami (zwykłe z osobą,
 * która potwierdziła obecność po otwarciu, pakiet z różnymi głosami przy pozycjach, kworum, tajne,
 * głosowanie bez punktu), publicznym załącznikiem PDF i historią obecności.
 * Konta: operator@demo.local / operator12345, radny01@demo.local / radny12345.
 */
import { PrismaClient, type VoteChoice } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();
const withClubs = process.argv.includes("--clubs");

const NAMES: [string, string, boolean][] = [
  ["Anna", "Nowak", true], ["Jan", "Kowalski", false], ["Łukasz", "Żak", false], ["Ewa", "Ślęzak", true], ["Piotr", "Łuczak", false],
  ["Zofia", "Ćwik", true], ["Marek", "Lis", false], ["Agnieszka", "Ostrowska", true], ["Tomasz", "Wiśniewski", false], ["Barbara", "Zając", true],
  ["Krzysztof", "Wójcik", false], ["Maria", "Kamińska", true], ["Andrzej", "Lewandowski", false], ["Katarzyna", "Zielińska", true], ["Paweł", "Szymański", false],
  ["Magdalena", "Woźniak", true], ["Michał", "Dąbrowski", false], ["Joanna", "Kozłowska", true], ["Grzegorz", "Jankowski", false], ["Monika", "Mazur", true],
  ["Rafał", "Kwiatkowski", false], ["Natalia", "Krawczyk", true], ["Adam", "Piotrowski", false], ["Aleksandra", "Grabowska", true], ["Jakub", "Nowakowski", false],
  ["Karolina", "Pawłowska", true], ["Mateusz", "Michalski", false], ["Dorota", "Król", true], ["Sebastian", "Wieczorek", false], ["Beata", "Jabłońska", true],
  ["Dariusz", "Wróbel", false], ["Elżbieta", "Nowicka", true], ["Robert", "Majewski", false], ["Iwona", "Olszewska", true], ["Wojciech", "Stępień", false],
  ["Renata", "Malinowska", true], ["Sofia", "Galaida", true], ["Jan", "Kowalski", false], ["Ołena", "Łapińska", true], ["Zbigniew", "Ąbel", false],
];

async function main() {
  const pw = await bcrypt.hash("radny12345", 10);
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { setupComplete: true, organizationName: "Rada Miejska w Przykładowie", groupsEnabled: withClubs, inquiriesEnabled: true, inquiriesPublicArchive: true },
    create: { id: "singleton", setupComplete: true, organizationName: "Rada Miejska w Przykładowie", groupsEnabled: withClubs, inquiriesEnabled: true, inquiriesPublicArchive: true },
  });
  await prisma.user.upsert({
    where: { email: "operator@demo.local" },
    update: {},
    create: { email: "operator@demo.local", passwordHash: await bcrypt.hash("operator12345", 10), firstName: "Olga", lastName: "Operatorka", role: "OPERATOR" },
  });

  const clubs = withClubs ? await Promise.all([
    prisma.group.upsert({ where: { name: "Klub Radnych Razem" }, update: {}, create: { name: "Klub Radnych Razem", shortName: "KRR", color: "#1E3A8A" } }),
    prisma.group.upsert({ where: { name: "Klub Obywatelski" }, update: {}, create: { name: "Klub Obywatelski", shortName: "KO", color: "#B91C1C" } }),
    prisma.group.upsert({ where: { name: "Koło Niezależnych" }, update: {}, create: { name: "Koło Niezależnych", shortName: "KN", color: "#15803D" } }),
  ]) : [];

  const users: Awaited<ReturnType<typeof prisma.user.upsert>>[] = [];
  for (const [i, [first, last, female]] of NAMES.entries()) {
    const email = `radny${String(i + 1).padStart(2, "0")}@demo.local`;
    const u = await prisma.user.upsert({
      where: { email },
      update: { groupId: clubs.length ? clubs[i % 3].id : null },
      create: { email, passwordHash: pw, firstName: first, lastName: last, femaleForms: female, role: "PARTICIPANT", groupId: clubs.length ? clubs[i % 3].id : null },
    });
    users.push(u);
  }

  // Dawny szablon składu (sprawdzenie migracji do grup organizacyjnych).
  const tpl = await prisma.meetingTemplate.upsert({ where: { name: "Rada - pełny skład (dawny szablon)" }, update: {}, create: { name: "Rada - pełny skład (dawny szablon)", description: "Utworzony przed wprowadzeniem grup" } });
  for (const [i, u] of users.entries()) {
    await prisma.meetingTemplateMember.upsert({ where: { templateId_userId: { templateId: tpl.id, userId: u.id } }, update: {}, create: { templateId: tpl.id, userId: u.id, hasVotingRight: i !== 39 } });
  }

  const unit = async (name: string, kind: "BODY" | "COMMITTEE", members: typeof users, fn?: (i: number) => string | null) => {
    const ex = await prisma.orgUnit.findFirst({ where: { name } });
    if (ex) return ex;
    return prisma.orgUnit.create({ data: { name, kind, members: { create: members.map((u, i) => ({ userId: u.id, functionName: fn?.(i) ?? null })) } } });
  };
  const rada = await unit("Rada Miejska", "BODY", users.slice(0, 39), (i) => (i === 0 ? "Przewodnicząca" : null));
  const budzet = await unit("Komisja Budżetowa", "COMMITTEE", users.slice(0, 10), (i) => (i === 0 ? "Przewodnicząca komisji" : "Członek"));
  const rewiz = await unit("Komisja Rewizyjna", "COMMITTEE", users.slice(5, 13), (i) => (i === 0 ? "Przewodnicząca komisji" : "Członek"));

  // Posiedzenie zakończone, opublikowane.
  const MID = "demoSesja2026sie";
  await prisma.meeting.deleteMany({ where: { id: MID } });
  const day = new Date("2026-08-07T13:00:00Z"); // 15:00 w Warszawie
  const t = (min: number) => new Date(day.getTime() + min * 60_000);
  const meeting = await prisma.meeting.create({
    data: {
      id: MID, number: "XXI/2026", name: "XXI sesja Rady Miejskiej w Przykładowie", scheduledAt: day, openedAt: t(2), closedAt: t(150),
      status: "CLOSED", publicEnabled: true, location: "Sala obrad, ul. Ratuszowa 1", attendanceMode: "SELF_CONFIRMATION",
      orgUnits: { create: [{ orgUnitId: rada.id }] },
    },
  });
  const voting = users.slice(0, 38); // 38 z prawem głosu
  const guest = users[39];
  const parts: Awaited<ReturnType<typeof prisma.meetingParticipant.create>>[] = [];
  for (const u of voting) parts.push(await prisma.meetingParticipant.create({ data: { meetingId: MID, userId: u.id, hasVotingRight: true } }));
  parts.push(await prisma.meetingParticipant.create({ data: { meetingId: MID, userId: guest.id, hasVotingRight: false, isInvitedGuest: true } }));
  // Obecność końcowa: 35 obecnych, 3 nieobecnych.
  const absentIdx = new Set([35, 36, 37]);
  for (const [i, p] of parts.entries()) {
    if (i === 38) continue;
    await prisma.attendance.create({ data: { participantId: p.id, status: absentIdx.has(i) ? "ABSENT" : "PRESENT", source: "PARTICIPANT", confirmedAt: t(1) } });
  }

  // Historia obecności: potwierdzenia na początku, spóźnienie (osoba 17 - po otwarciu głosowania nr 3),
  // wcześniejsze wyjście (osoba 20), wyjście i powrót (osoba 21), nieobecni (35-37), gość obecny.
  const ev = (i: number, present: boolean, min: number, source = "SELF") =>
    prisma.attendanceEvent.create({ data: { meetingId: MID, userId: parts[i].userId, present, at: t(min), source } });
  for (let i = 0; i < 38; i++) {
    if (i === 17) { await ev(i, true, 21); continue; }
    if (absentIdx.has(i)) { await ev(i, false, 5, "CHECK"); continue; }
    await ev(i, true, 1 + (i % 4));
  }
  await ev(20, false, 110, "OPERATOR");
  await ev(21, false, 40, "OPERATOR"); await ev(21, true, 55, "OPERATOR");
  await ev(38, true, 2);
  await prisma.attendance.updateMany({ where: { participantId: parts[20].id }, data: { status: "ABSENT" } });

  const item = (order: number, number: string, title: string, extra: Record<string, unknown> = {}) =>
    prisma.agendaItem.create({ data: { meetingId: MID, order, number, title, status: "COMPLETED", ...extra } });
  const i1 = await item(1, "1", "Otwarcie sesji i stwierdzenie prawomocności obrad", { startedAt: t(2), completedAt: t(8) });
  await item(2, "2", "Przyjęcie porządku obrad", { manuallyCompleted: true });
  const i3 = await item(3, "3", "Projekt uchwały w sprawie wygaśnięcia mandatu radnej Sofii Galaidy (druk nr 57)", { startedAt: t(10), completedAt: t(30) });
  const i31 = await item(4, "3.1", "Opinia Komisji Rewizyjnej do projektu z druku nr 57", { isSubItem: true, startedAt: t(12), completedAt: t(16) });
  await item(5, "", "Przerwa", { unnumbered: true, startedAt: t(30), completedAt: t(45) });
  const i4 = await item(6, "4", "Projekt uchwały w sprawie zmian w budżecie miasta na 2026 rok (druk nr 58) - pakiet poprawek", { startedAt: t(45), completedAt: t(100) });
  await item(7, "5", "Wolne wnioski i informacje", { status: "PENDING" });

  // Publiczny załącznik PDF do punktu 3.
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const dir = path.join(process.cwd(), "storage", "attachments");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "demo-druk-57.pdf"), pdf);
  await prisma.attachment.create({ data: { meetingId: MID, agendaItemId: i3.id, fileName: "druk_nr_57_projekt_uchwaly.pdf", storedName: "demo-druk-57.pdf", mimeType: "application/pdf", sizeBytes: pdf.length, visibleToParticipants: true, visibleToPublic: true } });

  // Pomocnik: zamknięte głosowanie z migawką składu.
  let num = 0;
  async function vote(opts: {
    agendaItemId: string | null; title: string; type?: "STANDARD" | "PACKAGE" | "QUORUM"; secret?: boolean; at: number;
    presentAtOpen: Set<number>; choices?: Map<number, VoteChoice>; positions?: string[]; posChoices?: Map<number, VoteChoice[]>; contextLabel?: string;
  }) {
    num++;
    const type = opts.type ?? "STANDARD";
    const v = await prisma.vote.create({
      data: {
        meetingId: MID, agendaItemId: opts.agendaItemId, title: opts.title, type, number: num, status: "CLOSED",
        visibility: opts.secret ? "SECRET" : "OPEN", openedAt: t(opts.at), closedAt: t(opts.at + 2), contextLabel: opts.contextLabel ?? null,
        majorityKind: type === "PACKAGE" ? "SIMPLE" : "SIMPLE",
        resultEligibleCount: voting.length, resultPresentCount: type === "QUORUM" ? null : opts.presentAtOpen.size,
        options: opts.positions ? { create: opts.positions.map((label, i) => ({ order: i, label, positionNumber: String(i + 1) })) } : undefined,
      },
      include: { options: { orderBy: { order: "asc" } } },
    });
    await prisma.voteRoster.createMany({
      data: [...voting].map((u, i) => ({ voteId: v.id, userId: u.id, lastName: u.lastName, firstName: u.firstName, clubShort: clubs.length ? clubs[i % 3].shortName : null, hasVotingRight: true, present: type === "QUORUM" ? false : opts.presentAtOpen.has(i), order: i })),
    });
    let yes = 0, no = 0, abstain = 0, cast = 0;
    if (type === "QUORUM") {
      for (const i of opts.presentAtOpen) { await prisma.ballot.create({ data: { voteId: v.id, userId: voting[i].id } }); cast++; }
      await prisma.vote.update({ where: { id: v.id }, data: { resultCastCount: cast, resultPresentCount: cast, resultPassed: cast > voting.length / 2, resultQuorumMet: cast > voting.length / 2 } });
      return v;
    }
    if (type === "PACKAGE") {
      const tallies = v.options.map(() => ({ y: 0, n: 0, a: 0 }));
      for (const [i, cs] of opts.posChoices!) {
        const b = await prisma.ballot.create({ data: { voteId: v.id, userId: voting[i].id, voterFirstName: voting[i].firstName, voterLastName: voting[i].lastName } });
        cast++;
        for (const [pi, c] of cs.entries()) {
          await prisma.ballotSelection.create({ data: { ballotId: b.id, optionId: v.options[pi].id, choice: c } });
          if (c === "YES") tallies[pi].y++; else if (c === "NO") tallies[pi].n++; else tallies[pi].a++;
        }
      }
      for (const [pi, o] of v.options.entries()) await prisma.voteOption.update({ where: { id: o.id }, data: { resultYes: tallies[pi].y, resultNo: tallies[pi].n, resultAbstain: tallies[pi].a, resultPassed: tallies[pi].y > tallies[pi].n } });
      await prisma.vote.update({ where: { id: v.id }, data: { resultCastCount: cast, resultPassed: true, resultQuorumMet: true } });
      return v;
    }
    if (opts.secret) {
      for (const [i, c] of opts.choices!) {
        await prisma.secretBallotMarker.create({ data: { voteId: v.id, userId: voting[i].id } });
        if (c === "YES") yes++; else if (c === "NO") no++; else abstain++;
      }
      cast = yes + no + abstain;
      await prisma.vote.update({ where: { id: v.id }, data: { resultCastCount: cast, resultPresentCount: cast, resultYes: yes, resultNo: no, resultAbstain: abstain, resultInvalid: 0, resultPassed: yes > no, resultQuorumMet: true, secretYes: yes, secretNo: no, secretAbstain: abstain } });
      return v;
    }
    for (const [i, c] of opts.choices!) {
      await prisma.ballot.create({ data: { voteId: v.id, userId: voting[i].id, choice: c, voterFirstName: voting[i].firstName, voterLastName: voting[i].lastName } });
      if (c === "YES") yes++; else if (c === "NO") no++; else abstain++;
      cast++;
    }
    await prisma.vote.update({ where: { id: v.id }, data: { resultCastCount: cast, resultYes: yes, resultNo: no, resultAbstain: abstain, resultPassed: yes > no, resultQuorumMet: true } });
    return v;
  }

  const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
  const presentAll = new Set(range(0, 35));
  // 1: kworum
  await vote({ agendaItemId: i1.id, title: "Sprawdzenie kworum", type: "QUORUM", at: 3, presentAtOpen: presentAll });
  // 2: zwykłe, punkt 1
  await vote({ agendaItemId: i1.id, title: "Przyjęcie protokołu z poprzedniej sesji", at: 6, presentAtOpen: presentAll, choices: new Map(range(0, 35).map((i) => [i, i < 30 ? "YES" : i < 33 ? "NO" : "ABSTAIN"])) });
  // 3: zwykłe, punkt 3 - przy otwarciu 17 obecnych (0..16); 0..15 głosuje ZA, 16 nie głosuje;
  //    osoba 17 potwierdziła obecność po otwarciu i głosuje ZA -> 17 głosów, 17 obecnych przy otwarciu.
  const p3 = new Set(range(0, 17));
  await vote({ agendaItemId: i3.id, title: "Całość projektu uchwały", at: 20, presentAtOpen: p3, choices: new Map([...range(0, 16).map((i) => [i, "YES"] as [number, VoteChoice]), [17, "YES"]]) });
  // 4: zwykłe w podpunkcie 3.1
  await vote({ agendaItemId: i31.id, title: "Przyjęcie opinii komisji", at: 14, presentAtOpen: presentAll, choices: new Map(range(0, 35).map((i) => [i, i % 4 === 0 ? "NO" : "YES"])) });
  // 5: pakiet - różne głosy przy pozycjach
  const pos = ["Poprawka nr 1 - zwiększenie wydatków na oświatę", "Poprawka nr 2 - przesunięcie środków na drogi", "Poprawka nr 3 - rezerwa celowa"];
  const ch: VoteChoice[] = ["YES", "NO", "ABSTAIN"];
  await vote({ agendaItemId: i4.id, title: "Pakiet poprawek do projektu budżetu", type: "PACKAGE", at: 60, presentAtOpen: presentAll, positions: pos,
    posChoices: new Map(range(0, 33).map((i) => [i, [ch[i % 3], ch[(i + 1) % 3], ch[(i * 7) % 3]]])) });
  // 6: tajne
  await vote({ agendaItemId: i4.id, title: "Wybór członka komisji (głosowanie tajne)", secret: true, at: 80, presentAtOpen: presentAll, choices: new Map(range(0, 34).map((i) => [i, i < 20 ? "YES" : i < 30 ? "NO" : "ABSTAIN"])) });
  // 7: bez punktu (wniosek formalny)
  await vote({ agendaItemId: null, title: "Wniosek formalny o zamknięcie dyskusji", at: 90, presentAtOpen: presentAll, contextLabel: "Wniosek formalny zgłoszony w trakcie obrad", choices: new Map(range(0, 35).map((i) => [i, i < 25 ? "YES" : "NO"])) });

  console.log(JSON.stringify({ meetingId: MID, orgUnits: [rada.id, budzet.id, rewiz.id], users: users.length, clubs: clubs.length }));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
