# Pengeoversikt

Privat økonomi-app for mobilen. Du eksporterer CSV-filer fra nettbanken (én fil per konto) og importerer dem i appen. Appen finner kontoen, rydder teksten, kategoriserer, kjenner igjen faste trekk og lager oversikt og statistikk. Alt kjører i nettleseren og lagres bare på enheten din: ingen server, ingen innlogging, ingen sky, ingen sporing.

Teknologi: Vite, React, TypeScript, Tailwind, Dexie (IndexedDB), PapaParse, Chart.js, en Web Worker for klassifisering og aggregering, og vite-plugin-pwa for installering og offline-bruk.

## Slik eksporterer du CSV fra nettbanken

1. Logg inn i nettbanken og åpne kontoen.
2. Velg transaksjonsoversikten og perioden du vil ha med (overlapp med forrige eksport er helt greit, appen dedupliserer).
3. Velg **Eksporter** → **CSV**. Filen heter typisk `Transaksjonsliste-dd-mm-åå-dd-mm-åå.csv`.
4. Gjenta for hver konto. Filene sier ikke selv hvilken konto de gjelder, men appen finner det ut fra radene.
5. Importer alle filene i én omgang med **Importer**-knappen på Oversikt.

På telefonen kan du lagre filene i Filer-appen (iPhone) eller Nedlastinger (Android) og velge dem derfra. På Android kan du også **dele** CSV-filen rett til Pengeoversikt fra nettbank-appen eller filbehandleren.

## Slik installerer du appen

Appen må **legges til på Hjem-skjermen**. Da får den sin egen lagringsplass som nettleseren ikke rydder bort, og den virker uten nett.

**iPhone (Safari):**
1. Åpne appens adresse i Safari.
2. Trykk **Del** (firkanten med pil opp).
3. Velg **Legg til på Hjem-skjerm** og trykk **Legg til**.
4. Åpne appen fra Hjem-skjermen fra nå av. Åpner du den i Safari i stedet, ser du ikke de samme dataene.

**Android (Chrome):**
1. Åpne appens adresse i Chrome.
2. Trykk menyen (⋮) → **Installer app** (eller **Legg til på startskjermen**).
3. Åpne appen fra startskjermen.

## Slik tar du sikkerhetskopi

Dataene ligger kun i nettleserens lagring på enheten. Bytter du telefon, sletter nettleserdata eller avinstallerer appen, er de borte. Ta derfor kopi jevnlig (appen minner deg på det etter 30 dager).

1. Gå til **Mer → Sikkerhetskopi**.
2. La **Krypter med passord** stå på og velg et passord (minst 8 tegn). Uten passordet kan ingen åpne kopien, heller ikke du.
3. Trykk **Lag sikkerhetskopi**. På mobil får du delingsarket (lagre i Filer/Disk/e-post til deg selv), på PC lastes filen ned.
4. Gjenopprett med **Velg sikkerhetskopi** på den nye enheten. Alt i appen erstattes etter bekreftelse.

Du kan også eksportere alle transaksjoner med kategori som CSV for Excel.

## Slik kjører du prosjektet lokalt

Krever Node 22 eller nyere.

```bash
npm install
```

```bash
npm run dev
```

Appen kjører da på `http://localhost:5178`.

Andre kommandoer:

| Kommando | Hva |
|---|---|
| `npm test` | Enhetstester (Vitest), inkludert fasit-testene mot `tests/fixtures/` |
| `npm run test:e2e` | Playwright-test i iPhone-visning (første gang: `npx playwright install chromium`) |
| `npm run typecheck` | TypeScript |
| `npm run build` | Produksjonsbygg til `dist/` |
| `npm run icons` | Lager PNG-ikoner fra SVG-kilden |

### Publisering

GitHub Actions (`.github/workflows/deploy.yml`) kjører typesjekk, enhetstester, Playwright og bygg ved hver push til `main`, og publiserer til GitHub Pages bare når alt er grønt. Slå på **Settings → Pages → Source: GitHub Actions** i repoet. `base` settes automatisk til `/<repo-navn>/`.

## Struktur

```
src/core/        ren TypeScript uten DOM: parsing, normalisering, ordbok, nøkkelord, regler,
                 klassifisering, dedupe, faste trekk, aggregering, penger/datoer, kryptering
src/core/formats/  formatregister (bankformatet + generisk kolonnekart)
src/db/          Dexie-skjema, import, reklassifisering, handlinger, sikkerhetskopi
src/workers/     Web Worker (klassifisering og aggregering) og klient
src/ui/          skjermer og komponenter
tests/fixtures/  syntetiske testdata og fasit (endres ikke)
tests/unit/      Vitest
tests/e2e/       Playwright
```

Valg som ikke står i spesifikasjonen er beskrevet i `BESLUTNINGER.md`.

## Personvern

- Ingen nettverkskall etter at appen er lastet (`connect-src 'self'` i CSP).
- Ingen analyse, sporing, eksterne fonter eller CDN-er.
- Ekte bankdata skal aldri inn i repoet. `.gitignore` blokkerer `*.csv` utenfor `tests/fixtures/`, og en test feiler hvis et kontonummer i fixtures ikke står i `tests/fixtures/tillatte-kontonumre.txt`.
