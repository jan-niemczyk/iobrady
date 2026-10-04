# Komponenty zewnętrzne i ich licencje

Zestawienie przygotowane na podstawie `package-lock.json` i plików w repozytorium (stan: październik 2026).
Nie jest poradą prawną.

## Biblioteki npm (zależności produkcyjne, łącznie z pośrednimi)

| Licencja | Liczba pakietów |
|---|---|
| MIT | 145 |
| Apache-2.0 | 27 |
| ISC | 13 |
| BSD-2-Clause, BSD-3-Clause, 0BSD, BlueOak-1.0.0, MIT-0 | 6 |
| LGPL-3.0-or-later (sama lub łącznie z Apache-2.0 / MIT) | 14 |
| inne (opisane niżej) | 4 |

Główne biblioteki: Next.js (MIT), React (MIT), Prisma (Apache-2.0), NextAuth (ISC), pdfmake (MIT),
docx (MIT), Bootstrap (MIT - informacja o licencji zostaje w zbudowanym pliku CSS), zod (MIT),
date-fns (MIT), qrcode (MIT), bcryptjs (MIT), nodemailer (MIT-0).

Licencje wymagające uwagi:

- **`@img/sharp-libvips-*`, `@img/sharp-*` (LGPL-3.0-or-later)** - opcjonalne pakiety biblioteki `sharp`
  (przetwarzanie obrazów w Next.js), instalowane tylko dla platformy, na której budowany jest obraz.
  Biblioteka libvips jest dołączana dynamicznie; LGPL dopuszcza takie użycie w oprogramowaniu
  o innej licencji. Rozpowszechniając obraz Dockera, należy zachować teksty licencji
  (są w `node_modules` w obrazie).
- **`caniuse-lite` (CC-BY-4.0)** - dane o przeglądarkach używane przy budowaniu; wymaga przypisania autorstwa,
  które zawiera sam pakiet.
- **`jszip` (MIT lub GPL-3.0-or-later)** - podwójna licencja; projekt korzysta z niej na zasadach MIT.
- **`pako` (MIT i Zlib)** - obie licencje zezwalające.
- **`png-js`** - pole licencji w `package.json` jest puste; plik `LICENSE` pakietu zawiera licencję MIT.

Pełna lista (pakiet, wersja, licencja) do wygenerowania w katalogu projektu po `npm ci`:

```bash
node -e 'const l=require("./package-lock.json").packages;for(const[k,v]of Object.entries(l))if(k&&!v.dev)console.log(k.replace(/^.*node_modules\//,""),v.version,v.license||"(brak pola - patrz LICENSE pakietu)")'
```

Narzędzia tylko do budowy i testów (Tailwind CSS, Sass, TypeScript, Playwright, tsx) nie trafiają
do działającej aplikacji poza wygenerowanym CSS.

## Czcionki

- **Lato** (`public/fonts/Lato-*.ttf`, używana w dokumentach PDF) - Łukasz Dziedzic, SIL Open Font
  License 1.1; tekst licencji: `public/fonts/Lato-OFL.txt`. Pliki pochodzą z Google Fonts.
- **Czcionki ekranu sali, nakładki i panelu** (Inter, JetBrains Mono, Outfit, Atkinson Hyperlegible,
  DM Sans, Fira Sans, IBM Plex Sans, Lato, Open Sans, Plus Jakarta Sans, Roboto, Source Sans 3, Clarity
  City, Barlow, Public Sans, Arimo, Nunito Sans, Titillium Web, Zalando Sans, Manrope, Mona Sans,
  Instrument Sans, Rethink Sans, Ubuntu Sans, Archivo, Familjen Grotesk, Poppins) - **nie są
  rozpowszechniane z aplikacją**; przeglądarka pobiera je z Google Fonts na licencjach podanych przy
  każdej rodzinie w Google Fonts (SIL OFL 1.1 lub Apache 2.0).
- **Tahoma** - czcionka systemowa Windows (Microsoft), tylko wskazywana z nazwy; niedostępna poza
  Windows zastępowana jest czcionkami Verdana, Segoe UI lub Arimo. Nie jest rozpowszechniana.
- Dokumenty DOCX wskazują czcionkę Arial z systemu użytkownika (nie jest dołączana).

## Grafika

- `public/icon.svg` - prosta ikona (znak zaznaczenia na granatowym tle) zapisana bezpośrednio jako SVG
  w repozytorium; brak zewnętrznego źródła.
- Logo i tła planszy wgrywa użytkownik instalacji - prawa do nich należą do użytkownika.

## Obrazy Dockera (pobierane przy instalacji, nie są częścią repozytorium)

- `node:22-alpine` - Node.js (MIT) z pakietami Alpine Linux (różne licencje otwarte),
- `postgres:16-alpine` - PostgreSQL (PostgreSQL License),
- `caddy:2-alpine` - Caddy (Apache-2.0).
