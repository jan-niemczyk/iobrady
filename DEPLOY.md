# Wdrożenie eSOG - paczka skumulowana od zmiany autonumeracji (2.1/2.2/2.3)

To jedno wdrożenie obejmuje wszystko od tamtej pory. Zawiera ZMIANĘ SCHEMATU i NOWĄ ZALEŻNOŚĆ,
więc wymaga pełnej procedury (backup + build). `prisma db push` aplikuje zmiany schematu idempotentnie.

## Co się zmienia

### Schemat bazy (db push załatwia całość, pomija już istniejące)
- MeetingParticipant.priorityAgendaItemIds String[] - priorytet w wielu punktach
- AgendaItem.committee String? - opinia/komisja
- enum AttendanceCheckKind.INCREMENTAL - korekta obecności
- Meeting: attendanceSelfCheckEnabled, discussionElapsedSec, discussionRunningSince, clubClocks - licznik netto
- modele AttendanceCheck / AttendanceCheckEntry - migawki obecności
- Vote: pinRequired, pinCode, requireAllPositions, type (STANDARD/LIST/QUORUM/PACKAGE); model VotePinAuth
- Guest - katalog gości
- User.passwordHash - logowanie hasłem (jeśli nie było)

### Nowa zależność
- docx (protokół/porządek DOCX). Dockerfile robi npm install, więc dociągnie sam.

### Nowe zmienne (tylko jeśli seedujesz pustą bazę)
- SEED_OPERATOR_EMAIL (domyślnie operator@esog.local)
- SEED_OPERATOR_PASSWORD (min. 8 znaków; bez niej seed przerywa)
Seed tworzy TYLKO ustawienia + jedno konto operatora. Konta z prostymi hasłami już nie powstają.

## Procedura (backup OBOWIĄZKOWY - schemat się zmienia)

  scp ~/Downloads/esog.tar.gz root@167.233.60.227:/root/
  ssh root@167.233.60.227
  cd /root
  docker compose -f /root/esog/docker-compose.yml exec -T db pg_dump -U esog esog | gzip > /root/esog-backup-$(date +%F-%H%M).sql.gz
  docker compose -f /root/esog/docker-compose.yml down
  cp /root/esog/.env /root/esog.env.SAVE
  rm -rf /root/esog && tar xzf esog.tar.gz
  cp /root/esog.env.SAVE /root/esog/.env
  cd /root/esog && docker compose up -d --build
  docker compose logs app --tail=100 -f      # czekaj na ✓ Ready

## Istniejące konto operatora
Masz już konto → NIE ustawiaj INIT_SEED=true (seed pomija istniejące). Czysty seed tylko przy pustej bazie.

## Weryfikacja po wdrożeniu
- Podpunkty 2.1/2.2 (nie 2a/2b); punkty niepogrubione, podpunkt z wcięciem
- Dokumenty: bez kropek środkowych, czarno-białe, kreski czarne, DOCX Arial, bez "scalona"/"dziennik"
- Lista do podpisu ~20/stronę font 10; raport migawki dwie kolumny ob./nb. + nr strony
- Protokół: listy, pakiety, kworum
- Priorytet "+ Priorytet" zielony; zakres multi-select (Globalny + numery)
- Wniosek formalny: licznik + ±30 s; toast u operatora
- Radny: przełącznik posiedzeń; głosowanie ponad wyborem posiedzenia; dwa głosowania naraz z nazwą
- Operator: okno wyniku po zamknięciu; "Uczestnicy"+"Goście" w Obecności; korekta obecności
- Przewodniczący: wszystkie typy; trzyma wyniki imienne ~25 s
- Głosowanie: podgląd głosu + "Zeruj"; edycja przed startem = pełny composer; PDF pakietu imienny
- Zmiana hasła: operator (Ustawienia) i radny (/account)
- Bezpieczeństwo: /api/meetings/[id]/state tylko operator; logowanie bez wersji/"Pomoc"

## Błąd typu przy build
Błędy TS wychodzą pojedynczo. Skopiuj komunikat - poprawka i przepakowanie są szybkie.
