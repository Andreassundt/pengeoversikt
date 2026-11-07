# Oppdrag: «Pengeoversikt» – privat økonomi-app for mobil (PWA)

Du skal bygge en app jeg bruker på mobilen for å få oversikt over økonomien min. Jeg eksporterer CSV-filer fra nettbanken (én fil per konto) og importerer dem i appen. Appen rydder, kategoriserer og lager oversikt og statistikk automatisk. Det skal kreve så lite manuelt arbeid som mulig, men alt skal kunne rettes.

Les hele dokumentet før du starter. Testdata ligger i `tests/fixtures/` (se seksjon 13). Det er laget i nøyaktig samme format som min ekte bankeksport, men med oppdiktede navn, kontonumre og steder. Ekte bankdata skal aldri inn i repoet.

Arbeidstittelen «Pengeoversikt» kan byttes. Hele grensesnittet skal være på norsk bokmål. Kode, identifikatorer og kommentarer skriver du på engelsk.

---

## 1. Absolutte krav

1. **Mobil først.** Appen brukes nesten bare på telefon (både iPhone og Android må fungere). Den skal være installerbar som PWA og fungere offline. På PC skal den også virke (dra og slipp filer), men PC er ikke målet.
2. **Ingen server og ingen bakgrunnsjobber.** Alt kjører i nettleseren. Data lagres lokalt på enheten (IndexedDB). Ingen innlogging, ingen sky, ingen synkronisering.
3. **Personvern.** Appen skal ikke gjøre nettverkskall når den kjører, utover å laste selve appen. Ingen analyse- eller sporingsverktøy, ingen eksterne fonter eller CDN-er, ingen feilrapportering til tredjepart. Sett en streng CSP (`connect-src 'self'`).
4. **Riktige tall.** Beløp lagres som heltall i øre, aldri som flyttall. Interne overføringer mellom mine egne kontoer skal aldri telle som inntekt eller forbruk.
5. **Enkel import.** Trykk på «Importer», velg én eller flere filer, se et sammendrag og bekreft. Appen finner selv ut hvilken konto hver fil tilhører, og det skal være trygt å importere overlappende perioder.
6. **Alt kan rettes og læres.** Retter jeg en kategori, spør appen om det skal gjelde alle lignende transaksjoner, og den husker valget.

## 2. Teknologi og struktur

- Vite + React + TypeScript (`strict`), Tailwind CSS
- Dexie (IndexedDB) for lagring. `navigator.storage.persist()` ved oppstart.
- PapaParse for CSV (felt med flere linjer inne i anførselstegn må fungere)
- Chart.js (via react-chartjs-2) for grafer
- vite-plugin-pwa (Workbox) for manifest, offline og installering
- Vitest for enhetstester, Playwright for en ende-til-ende-test i mobilvisning
- HashRouter, slik at oppfrisking fungerer på GitHub Pages
- Publisering til GitHub Pages med GitHub Actions. Deploy kjøres bare hvis testene går grønt.

Hold kjernelogikken ren og testbar, adskilt fra grensesnittet:

```
src/core/        ren TypeScript uten DOM: formater, parsing, normalisering, butikkord-
                 bok, regler, klassifisering, dedupe, faste trekk, aggregering, penger/datoer
src/core/formats/  formatregister (bankformatet nedenfor + generisk kolonnekart senere)
src/db/          Dexie-skjema, migreringer, repositories
src/workers/     Web Worker for reklassifisering og aggregering ved store datamengder
src/ui/          skjermer og komponenter
tests/fixtures/  testdata + fasit (følger med, ikke endre)
```

## 3. Bankformatet (slik ser eksporten ut)

Alle filene har samme format:

- UTF-8 **med BOM**, LF-linjeskift, semikolon som skilletegn, `"` som anførselstegn. Feltet `Melding/KID/Fakt.nr` kan inneholde **linjeskift inne i anførselstegn** og innrykk med mange mellomrom.
- Header (15 kolonner, nøyaktig):
  `Utført dato;Bokført dato;Rentedato;Beskrivelse;Type;Undertype;Fra konto;Avsender;Til konto;Mottakernavn;Beløp inn;Beløp ut;Valuta;Status;Melding/KID/Fakt.nr`
- Datoer: `dd.mm.yyyy`. Radene er sortert med nyeste først.
- Beløp i radene: **punktum som desimaltegn** og minimalt antall desimaler (`1500`, `-53.5`, `8968.79`). Inn står i `Beløp inn` (positivt), ut i `Beløp ut` (negativt, med minus).
- `Status` er `Bokført` eller `Reservert`. Reserverte rader har tom `Bokført dato` og tom `Undertype`. `Avsender` er da kontonavnet, og `Beskrivelse` er en kortere tekst enn den bokførte versjonen får senere.
- Kontonummer skrives `dddd dd ddddd`. **Filen sier ikke hvilken konto den gjelder**, og filnavnet er generisk (`Transaksjonsliste-07-11-25-07-11-26_3.csv`).
- **Bunntekst** etter første helt tomme rad (`;;;;;;;;;;;;;;`). Her er beløpene skrevet med komma som desimaltegn og **hardt mellomrom (U+00A0)** som tusenskille. Legg merke til den inkonsekvente skrivemåten («Total» og «Totalt») og de to mellomrommene i «Utgående  saldo»:
  ```
  Total beløp inn på konto:;;41 500,00 NOK;;;;;;;;;;;;
  Totalt beløp ut av konto:;;-40 500,00 NOK;;;;;;;;;;;;
  Inngående saldo pr. 07.11.2025:;;0,00 NOK;;;;;;;;;;;;
  Utgående  saldo pr. 07.11.2026:;;1 000,00 NOK;;;;;;;;;;;;
  ```
  Datoene i bunnteksten gir filens periode. Reserverte rader er med i bankens summer og saldo.

Kombinasjoner av `Type` / `Undertype` som finnes i ekte data:

| Type | Undertype | Betyr |
|---|---|---|
| Varekjøp | Varekjøp debetkort | Kortkjøp i Norge, eller nettkjøp via norsk innløser |
| Varekjøp | Varekjøp i utlandet | Kortkjøp hos utenlandsk brukersted (ofte NOK) |
| Varekjøp | Varekjøp ubetjent | Automat, nesten alltid drivstoffpumpe |
| Varekjøp | *(tom)* | Reservert kortkjøp |
| Overføring | Overføring til egen konto | Mellom egne kontoer. Brukes på **begge** sider, også for «fra». |
| Overføring | Kreditoverføring | Refusjon til kortet. `Melding` viser det opprinnelige kjøpet. |
| Betaling innland - Småsparing | Innlandsbetaling | Automatisk småsparing mellom egne kontoer (`Småsparing 3 stk fast beløp`) |
| Betaling innland | Innlandsbetaling | Betaling til person/firma, eller Vipps-gebyr |
| Betaling innland | Betaling med KID innland | Regning med KID (internett, forsikring, Nordnet-innskudd o.l.) |
| Betaling innland | Betaling med melding innland | Betaling med melding |
| Betaling innland | Overføring fra annen konto | Innbetaling fra annen bank/person/firma |
| Betaling innland | Overføring til annen konto | Utbetaling til annen bank |
| Betaling innland | Nedbetaling av lån | Terminbeløp. `Melding` har fordeling på avdrag/renter/gebyr. |
| immediate | Straksbetaling | Straksbetaling inn eller ut |
| Lønn | Lønn / Pensjon | Lønn fra arbeidsgiver / utbetaling fra NAV |
| Betaling | Omkostninger | Bankgebyr (f.eks. «Mobilgiro m/melding») |

Lag parseren tolerant: ukjente kombinasjoner skal ikke krasje, bare havne i «Uavklart».

## 4. Importflyt

**Brukerflyt:** En stor «Importer»-knapp på Oversikt åpner filvelgeren (`accept=".csv,text/csv"`, flere filer). På Android skal appen i tillegg registrere seg som **Web Share Target**, slik at jeg kan dele en CSV rett til appen. På PC fungerer dra og slipp.

**For hver fil:**

1. **Gjenkjenn format.** Sammenlign headeren med formatregisteret. Er formatet ukjent, vis en kolonnekart-veiviser (dato, beløp eller inn/ut, tekst, melding, motpartskonto/-navn). Lagre den som en formatprofil knyttet til header-signaturen. Veiviseren kan komme i en senere milepæl, men arkitekturen må ha plass til den.
2. **Les rader og bunntekst.** Stopp ved første tomme rad. Les summer, periode, inngående og utgående saldo.
3. **Finn kontoen.** Ta hensyn til fortegnet: kontoen er `Til konto` for rader med positivt beløp og `Fra konto` for rader med negativt beløp. Den må være lik på alle rader. Ikke bruk «nummeret som finnes på alle rader», for en fil med bare innkommende overføringer fra én annen egen konto har begge numrene på alle rader. Ukjent konto opprettes automatisk.
4. **Finn kontonavn.** Hent navnet fra rader med `Overføring til egen konto`: `Avsender` er navnet på fra-kontoen og `Mottakernavn` navnet på til-kontoen. Bruk alle importerte filer, ikke bare den gjeldende. Navnet kan endres manuelt.
5. **Finn eier.** Eiernavnet er det vanligste `Avsender` på kortkjøp, og bekreftes av `Mottakernavn` på innbetalinger. Navn sammenlignes alltid normalisert (se 5.2).
   **Motpartsnavn** er `Avsender` for rader inn og `Mottakernavn` for rader ut. Er feltet tomt, brukes `Beskrivelse` uten et eventuelt `(kontonummer)` på slutten. Innkommende straksbetalinger har alltid tom `Avsender`, så navnet står bare i `Beskrivelse`.
6. **Erstatt reserverte rader.** Er filen minst like ny som siste import for kontoen (sluttdatoen i bunnteksten), slett alle lagrede `Reservert`-rader for kontoen med dato innenfor filens periode, og sett så inn filens reserverte rader. Er filen **eldre**, hopper du over filens reserverte rader og lar de lagrede stå. Ellers kommer utdaterte reservasjoner tilbake og telles dobbelt. Når en reservasjon blir bokført, endres teksten (`REMA STORGATA` → `06.11 REMA STORGATA  OSLO`) og ofte datoen. Derfor kan reserverte rader ikke dedupes på innhold.
7. **Dedupe bokførte rader med telling.** Bygg en nøkkel av konto + alle 15 rå felt. **Identiske rader finnes i ekte data** (f.eks. to like overføringer på 3 000 kr samme dag). For hver nøkkel: hvis filen har n forekomster og databasen m, legg til max(0, n − m). Overlappende eksporter gir da verken tap eller duplikater.
8. **Valider.** Sammenlign summen av radene med bunntekstens summer. Sjekk at inngående saldo + netto = utgående saldo. Avvik gir **advarsel, ikke feil**. Banken utelater av og til rader som likevel er med i saldoen. Vis avviket i kroner.
9. **Klassifiser og etterbehandle** de nye radene (seksjon 7 og 8).
10. **Vis sammendrag før lagring**, per fil: konto, periode, antall nye, antall duplikater, antall reserverte erstattet, advarsler og «trenger avklaring: n». Lagringen skjer i én databasetransaksjon. «Angre siste import» skal finnes.

**Saldo:** Utgående saldo i bunnteksten er fasit for saldo på den datoen. Saldohistorikken regnes **bakover** fra den. Bruk alltid nyeste import som anker.

## 5. Normalisering

### 5.1 Datoer og beløp
- Beløp tolkes til øre som heltall uten flyttall. Gjør det ved å splitte strengen, ikke med `parseFloat`.
- **Kjøpsdato:** Kortkjøp i Norge har kjøpsdato først i `Beskrivelse` (`31.10 REMA STORGATA  OSLO`). Nett- og utenlandskjøp har den i `Melding` (`*9876 15.10 SEK 535.23 OKQ8 Kurs: 0.9836`). Året hentes fra `Utført dato`. Blir datoen da senere enn utført dato, trekk fra ett år (`31.12` utført `02.01.2027` → `31.12.2026`).
- **Statistikkdato** = kjøpsdato hvis den finnes, ellers utført dato. All månedsstatistikk bruker statistikkdato, slik at et kjøp 31.10 som bokføres 02.11 hører til oktober.
- **Kortinfo fra `Melding`:** regex `^\*(\d{4}) (\d{2}\.\d{2}) ([A-Z]{3}) ([\d.]+) (.*?) Kurs: ([\d.]+)$` gir kortets siste 4 siffer, kjøpsdato, originalvaluta, originalbeløp, butikktekst og kurs. Lagre originalvaluta og -beløp og vis dem (f.eks. «SEK 535,23 · kurs 0,9836»).

### 5.2 Tekst
- **7-bits tegn:** Noen navn og meldinger fra andre banker bruker gamle erstatningstegn. `@` mellom store bokstaver er `Ø` (`B@RGE` → `BØRGE`, `OPPGJ@R` → `OPPGJØR`). `}` er `å`, `|` er `ø`, `{` er `æ`, `[` er `Æ`, `]` er `Å`, `\` er `Ø`. Gjør bare dette i navn og meldinger der mønsteret passer, ikke i e-postadresser o.l. Behold alltid råteksten ved siden av.
- **Folding for matching:** store bokstaver, `Ø→OE`, `Æ→AE`, `Å→AA`, `Ö→OE`, `Ä→AE`, `Ü→U`, og flere mellomrom slått sammen til ett. Da blir `ELKJØP`, `Elkjoep` og `ELKJOEP` like, og `HÖÖKS` og `Hoeoeks` blir like.
- **Navn på personer** sammenlignes etter 7-bits-fiks og folding (`B@RGE TESTESEN` = `Børge Testesen`).

### 5.3 Butikknøkkel og visningsnavn
Velg kilde: butikkteksten fra kort-`Melding` hvis den finnes, ellers `Beskrivelse` uten datoprefiks. Så:
1. Fjern prefikser fra betalingsformidlere, og lagre dem som metadata («via Vipps»): `Vipps*`, `WL *`, `WL*`, `W*`, `PAYPAL *`, `PAYPAL_*`, `SP ` (Shopify), `SQ *`, `SUMUP *`, `IZ *`, `ZETTLE_*`. Ikke fjern leverandørnavn som `GOOGLE*`, `OPENAI *` eller `ANTHROPIC*`.
2. Fjern støy: koder som starter med `*` og inneholder minst ett siffer (`*AB12CD34`, `**1122*`, men ikke `*YouTubePremium`), og rene tall eller koder med sifre (`57800031`, `4259522985`, `1.888.858.2569`, butikknummer som `539` og `5006`).
3. Fold (5.2). Resultatet er **butikknøkkelen** som brukes til læring og faste trekk.
4. **Visningsnavn:** det kanoniske navnet fra butikkordboken, ellers den rensede teksten i pen stor/liten-skrivemåte. Butikk og sted kan vises som detalj («Rema 1000 · Storgata, Oslo»).

Fallgruver fra ekte data:
- `KID 47099 STORGATA 1 OSLO` er butikkjeden **Kid Interiør**, ikke et KID-nummer.
- `204 JERNIA …` har butikknummeret **foran** kjedenavnet.
- `MCD 072 …` er McDonald's, og `BK 5006 …` er Burger King.

## 6. Kategorier og beregningsregler

Hver kategori har en **art** (`kind`): `income`, `expense`, `saving`, `transfer` eller `unknown`. Standardoppsettet står under. Jeg skal kunne gi nytt navn, legge til, slå sammen, skjule og endre farge og ikon.

| Gruppe | Kategorier | Art |
|---|---|---|
| Inntekt | Lønn · NAV og trygd · Leieinntekt · Salg (FINN o.l.) · Gaver og arv · Annen inntekt | income |
| Bolig | Renter boliglån · Felleskostnader · Strøm og nettleie · Husleie · Forsikring | expense |
| Hjem | Møbler og interiør | expense |
| Mat og drikke | Dagligvarer · Mat ute · Kantine · Alkohol | expense |
| Transport | Drivstoff · Bil og vedlikehold · Kollektivtransport · Parkering og bom | expense |
| Shopping | Elektronikk · Klær og sko · Pleie og kosmetikk | expense |
| Fritid | Spill og apper · Hobby · Sport og trening · Kultur og underholdning · Reise · Lotteri og pengespill | expense |
| Abonnementer | Strømmetjenester · Programvare og AI · Internett og mobil | expense |
| Helse | Helse og apotek | expense |
| Annet | Delt husholdning · Gaver gitt · Gebyrer · Kontantuttak · Revolut-påfyll · Annet | expense |
| Sparing og investering | Investering · Avdrag boliglån · Boligkjøp og egenkapital | saving |
| Overføringer | Intern overføring · Egen konto i annen bank | transfer |
| — | Uavklart | unknown |

**Fortegn og summer (viktig):**
- *Forbruk* i en kategori = −(summen av beløpene). Et positivt beløp i en utgiftskategori er en refusjon og **trekker forbruket ned**. Når venner betaler meg tilbake for mat, blir altså netto matforbruk riktig. Vis både brutto og netto der det er nyttig.
- *Inntekt* = summen av beløpene i inntektskategoriene.
- *Sparing* = −(summen) i sparekategoriene. Uttak fra Nordnet gir negativ sparing, ikke inntekt.
- `transfer` holdes helt utenfor inntekt, forbruk og sparing. I mine ekte data er over 40 % av radene interne overføringer, så dette er kritisk.
- `Uavklart` telles ikke med i summene. Den vises som egen linje («Uavklart: 1 234 kr ut / 500 kr inn»), med et banner som sender meg til «Sjekk disse».
- **Engangsposter:** Transaksjoner med art `expense`, `income` eller `unknown` og |beløp| ≥ terskel (standard 20 000 kr, kan stilles) flagges `engangs` automatisk. Unntak er kategoriene Lønn, NAV og trygd og Leieinntekt, og transaksjoner som hører til et gjenkjent fast trekk. `saving` og `transfer` flagges aldri, fordi de ikke er med i forbruket. Flagget kan fjernes. Snitt og trender bruker *normalt forbruk* (uten engangs). Månedstallene viser begge.
- *Netto spart* = inntekt − forbruk. *Sparerate* = netto spart / inntekt.

## 7. Kategorisering: rekkefølge

Hver transaksjon får `categoryId`, `kind`, `source` og `confidence` (`høy`/`middels`/`lav`). Første regel som treffer vinner:

1. **Manuell** kategori (låst, og påvirkes aldri av reklassifisering).
2. **Strukturelle regler** (høy sikkerhet):
   - `Undertype = Overføring til egen konto`, **eller** motpartskontoen er en av mine importerte kontoer, **eller** `Type` slutter på `Småsparing` → **Intern overføring**. Ikke bruk bankens kontonummerprefiks som tegn på at en konto er min. Familie i samme bank har samme prefiks.
   - Motpartens navn er lik eiernavnet (normalisert), men kontoen er ikke min → **Egen konto i annen bank**. Det gjelder også `OPPGJØR AV KONTO` med tom fra-konto.
   - `Type = Lønn`: `Undertype = Pensjon` → **NAV og trygd**, ellers → **Lønn**.
   - `Undertype = Nedbetaling av lån` → **splitt** etter `Melding`: `Avdrag` → Avdrag boliglån, `Renter` → Renter boliglån, `Terminomkostninger` → Gebyrer. Beløpene står som `kr 4.972,00` (punktum er tusenskille, komma er desimal). Splittene må summere til radbeløpet, ellers lagres raden uten splitt og med en advarsel.
   - `Undertype = Omkostninger` → **Gebyrer**.
   - `Undertype = Kreditoverføring` → **refusjon**. Finn kjøpet med samme butikktekst og samme beløp innen 60 dager og kopier kategorien. Koble dem sammen: kjøpet flagges `refundert` og refusjonen `refusjon`. Finnes ikke kjøpet, klassifiser butikkteksten fra meldingen via ordboken.
3. **Mine eksplisitte regler** (fra Regler-siden), i prioritert rekkefølge. Mulige betingelser: retning (inn/ut), egen konto, motpartskonto, motpartsnavn, tekst eller melding inneholder (eller regex), type/undertype og beløpsintervall. Handling: kategori, flagg og visningsnavn.
4. **Lærte butikk-koblinger** (butikknøkkel → kategori), laget når jeg retter.
5. **Butikkordboken** (seksjon 7.1). Den matches mot butikkteksten for kortkjøp, og mot motpartsnavn/`Beskrivelse` for alle andre rader. Den matches **aldri** mot fri `Melding`-tekst. Unntaket er butikkdelen av kort-meldingen. Ellers ville f.eks. meldingen «Mat extra» til en person truffet Coop Extra.
6. **Nøkkelord i meldingen** (seksjon 7.2), for betalinger til og fra personer og andre uten treff. Treffer meldingen flere kategorier, velg den første i tabellen og sett `lav` sikkerhet («Matstrøm»).
7. **Personstandard** fra oppsettet (seksjon 9). Den har lavere prioritet enn nøkkelord.
8. **Heuristikker:**
   - `Varekjøp ubetjent` uten treff og |beløp| ≥ 200 → Drivstoff (`lav`).
   - Innbetaling via `ADYEN` med `FINNkode` i meldingen → Salg (FINN o.l.).
9. Ellers → **Uavklart**.

Reklassifiser alle ikke-manuelle transaksjoner når regler, ordbok eller oppsett endres. Gjør det i en Worker, og vis hvor mange som endret seg.

### 7.1 Butikkordbok (start)
Mønstrene er regex mot **foldet** tekst (5.2). Matchingen skjer etter at datoprefiks og formidler-prefiks er fjernet, men **før** tall fjernes, slik at `^MCD \d`, `^BK \d` og `^KID \d` virker.
- Standard er ordgrense foran (`\bFYSIO` treffer `FYSIOTERAPI` og `FYSIOT`). Legg til `\b` bak der det trengs.
- Korte eller generelle ord forankres til starten av butikkteksten (`^`), slik at f.eks. `NORMAL` ikke treffer `ABNORMAL`.
- Mer spesifikke mønstre står først (`APOTEK 1` før `APOTEK`).
- Skriv tester for falske treff.
- `fast` betyr «kjent abonnement eller fast regning» (brukes i seksjon 8).
- Gjør ordboken til en datafil som er lett å utvide.

**Drivstoffkjeder** har en egen regel: `Varekjøp ubetjent` → Drivstoff (`høy`). `Varekjøp debetkort` med |beløp| < 150 → Mat ute (kioskkjøp, `lav`). Ellers → Drivstoff (`middels`).

| Kategori | Mønstre → visningsnavn |
|---|---|
| Dagligvarer | REMA→Rema 1000 · KIWI→Kiwi · MENY→Meny · EXTRA→Coop Extra · COOP MEGA→Coop Mega · PRIX→Coop Prix · ^OBS\b→Coop Obs · COOP→Coop · BUNNPRIS→Bunnpris · ^SPAR\b→Spar · JOKER→Joker · ^ODA\b→Oda · HOLDBART→Holdbart · NAERBUTIKKEN→Nærbutikken · SUPERMARK\|SUPERMAR→Supermarked |
| Alkohol | VINMONOPOLET→Vinmonopolet |
| Mat ute | MCDONALDS\|^MCD \d→McDonald's · ^BK \d\|BURGER KING→Burger King · MAX ?BURGERS→Max Burgers · DOMINOS→Domino's · PEPPES→Peppes Pizza · SUBWAY · STARBUCKS · ESPRESSO HOUSE · WAYNES · FOODORA→Foodora · ^WOLT→Wolt · TOO GOOD TO GO · 7-ELEVEN\|7 ELEVEN→7-Eleven · NARVESEN→Narvesen · DELI DE LUCA · TURISTHYTTE\|FJELLSTUE · ^KAFE\b\|^CAFE\b\|RESTAURANT |
| Kantine | ISS FACILITY\|ISS FOOD→ISS (kantine) · COMPASS GROUP · SODEXO · EUREST · KANTINE |
| Drivstoff (drivstoffkjeder) | ^ST1\b→St1 · CIRCLE K→Circle K · UNO-X→Uno-X · ^ESSO→Esso · ^SHELL→Shell · ^YX\b→YX · OKQ8→OKQ8 · ^PREEM→Preem · ^BEST\b→Best · TESLA SUPERCHARG\|IONITY\|RECHARGE\|FORTUM CHARGE (lading) |
| Bil og vedlikehold | BILVASK · MEKONOMEN · THANSEN · VIANOR · BILTEMA→Biltema · EU-KONTROLL\|EU KONTROLL |
| Parkering og bom | EASYPARK · APCOA · ONEPARK · AIMO PARK · FJELLINJEN · ^FERDE · AUTOPASS · BOMPENGER |
| Kollektivtransport | ^RUTER→Ruter · ^VY\b→Vy · FLYTOGET · ENTUR · ^ATB\b · ^SKYSS · KOLUMBUS · BRAKAR · ^BOLT\b · ^UBER · TAXI |
| Møbler og interiør | IKEA→IKEA · ALNA MOEBEL→Alna Møbel · SKOUSEN→Skousen · ^KID \d\|KID INTERIOER→Kid Interiør · JERNIA→Jernia · CLAS ?OHL(SON)?→Clas Ohlson · ^RUSTA\b→Rusta · SOESTRENE GRENE→Søstrene Grene · KITCHN\|KITCHENTIME\|KOKKEGLEDE→(kjøkkenbutikk) · KONTORSENTERET · JYSK · BOHUS · SKEIDAR · FAGMOEBLER · HABITAT · TILBORDS · ^CHILLI\b · JULA · EUROPRIS · ^NILLE · MAXBO · BYGGMAX · ^MONTER · OPTIMERA · PLANTASJEN · HAGELAND · FLUGGER |
| Elektronikk | ELKJOEP→Elkjøp · ^POWER\b→Power · KOMPLETT→Komplett · NETONNET · COMPUTERSALG→Computersalg · TEKNIKMAGASINET→Teknikmagasinet · TEKNIKDELAR→Teknikdelar · ^CDON→CDON · PROSHOP · DUSTIN · KJELL ?&? ?COMPANY |
| Klær og sko | ^H ?& ?M\b · ^ZARA · DRESSMANN · CUBUS · CARLINGS · KAPPAHL · LINDEX · BIK BOK · JACK ?& ?JONES · SKORINGEN · EURO ?SKO · NILSON · BOOZT · ZALANDO · ^ASOS · SHEIN |
| Pleie og kosmetikk | ^KICKS\b→Kicks · ^VITA\b→Vita · ^NORMAL\b→Normal · CUTTERS · FRISOER |
| Helse og apotek | APOTEK 1→Apotek 1 · VITUSAPOTEK→Vitusapotek · APOTEK\|APOTE\b→Apotek · ^BOOTS · FYSIO · LEGESENTER\|LEGEVAKT · TANNLEGE\|TANNHELSE · SPECSAVERS · BRILLEOPTIKK · OPTIKER |
| Sport og trening | ^XXL\b→XXL · ^SPORT ?1\b · INTERSPORT · ^G-SPORT\|^G SPORT · ANTON SPORT · IDRETTSFORBUND→Norges idrettsforbund · HOEOEKS→Hööks · ^SATS\b · ^EVO\b · FRESH FITNESS · ELIXIA · DECATHLON · LOEPLABBET |
| Spill og apper | STEAM→Steam · BATTLE\.NET\|BLIZZARD→Battle.net · ROBLOX→Roblox · GOOGLE PLAY→Google Play · PLAYSTATION\|SONY INTERACTIVE · NINTENDO · XBOX · EPIC GAMES · ^GOG |
| Hobby | GIGABOKS→Gigaboks · SPILLOTEKET→Spilloteket · OUTLAND · PANDURO |
| Kultur og underholdning | ODEON→Odeon Kino · NORDISK FILM\|^NF KINO\|KINO · TICKETMASTER · BILLETTSERVICE · ^TIX\b · ^NORLI\b→Norli · ^ARK\b · TANUM · ADLIBRIS |
| Reise | ^SAS\b · NORWEGIAN AIR · WIDEROE · BOOKING\.COM · AIRBNB · HOTELS\.COM · EXPEDIA · SCANDIC · ^THON\b · STRAWBERRY · RADISSON |
| Lotteri og pengespill | NORSK TIPPING→Norsk Tipping · RIKSTOTO |
| Strømmetjenester (fast) | YOUTUBE ?PREMIUM→YouTube Premium · PRIME VIDEO\|AMAZON PRIME→Prime Video · NETFLIX · SPOTIFY · VIAPLAY · TV ?2 PLAY · DISNEY · ^HBO\|^MAX\b · APPLE TV · STORYTEL · BOOKBEAT · AUDIBLE · TIDAL |
| Programvare og AI (fast) | OPENAI\|CHATGPT→ChatGPT · ANTHROPIC\|CLAUDE→Claude · MICROSOFT\|MSFT · ADOBE · DROPBOX · GOOGLE ONE · APPLE\.COM/BILL\|ICLOUD · GITHUB · DOMENESHOP→Domeneshop · MACROFACTO→MacroFactor · ^AD FREE FOR→Ad free for |
| Internett og mobil (fast) | LYSE TELE→Lyse Tele · ALTIBOX→Altibox · TELENOR · TELIA · ^ICE\b · TALKMORE · CHILI MOBIL · ONECALL · ALLENTE |
| Strøm og nettleie (fast) | TIBBER · FJORDKRAFT · HAFSLUND · ELVIA · LYSE ENERGI\|LYSE NETT · NORGESENERGI · TENSIO · GLITRE |
| Forsikring (fast) | FREMTIND→Fremtind · GJENSIDIGE · ^IF SKADE · ^TRYG\b · STOREBRAND · FRENDE · CODAN |
| Gebyrer | GEBYR VIPPS→Vipps-gebyr · GEBYR · AARSAVGIFT · TERMINGEBYR |
| Kontantuttak | MINIBANK · KONTANTUTTAK · ^ATM\b |
| Investering | NORDNET→Nordnet · ^KRON\b · ^FIRI\b |
| Revolut-påfyll | REVOLUT→Revolut. Penger flyttet til Revolut brukes som regel der, så de telles som forbruk til Revolut-data eventuelt importeres. Da kan kategorien byttes til overføring. |
| Boligkjøp og egenkapital | EIENDOMSMEGL\|PRIVATMEGLEREN\|KROGSVEEN\|NORDVIK\|EIENDOMSMEGLER 1 |

Tekst som inneholder `ABONNEMENT`, `SUBSCR` eller ` SUB` på slutten gir også `fast`-hint.

### 7.2 Nøkkelord i meldinger
Normaliser meldingen etter 7-bits-fiks: fold (5.2) og **slå sammen gjentatte bokstaver** (`MaAaat` → `MAT`, `Foooooood` → `FOD`). Gjør det samme med nøkkelordene.

Hvordan nøkkelordene matches:
- Normalisert lengde ≥ 5: hvor som helst i teksten. Norske sammensatte ord trenger det («Matstrøm» inneholder `STROEM`).
- Lengde ≤ 4: bare som **helt ord**, slik at `dekk` ikke treffer «dekker» og `bil` ikke treffer «billett».
- Ord merket `*` matches på ordstart (`mat*` treffer «Matstrøm» og «Mat»).

Prioritert rekkefølge:

| Nøkkelord | Ut (jeg betaler) | Inn (jeg mottar) |
|---|---|---|
| husleie | Husleie | Leieinntekt |
| felleskost | Felleskostnader | Felleskostnader (refusjon) |
| strøm, nettleie | Strøm og nettleie | Strøm og nettleie (refusjon) |
| forsikring | Forsikring | Forsikring (refusjon) |
| sushi, pizza, risbolle, burger, kebab, restaurant, lunsj | Mat ute | Mat ute (refusjon) |
| mat\*, food, middag, dagligvar | Dagligvarer | Dagligvarer (refusjon) |
| kino, konsert, billett | Kultur og underholdning | samme (refusjon) |
| bøter, botkasse, kontingent, trening, lisens | Sport og trening | samme |
| bremser, verksted, dekk, bil | Bil og vedlikehold | samme |
| klær, tskjorte, t-skjorte, sko, jakke | Klær og sko | samme |
| håndkle, tannkrem, dekor, møbel | Møbler og interiør | samme |
| gave, julegave, bursdag, arv | Gaver gitt | Gaver og arv |
| budsjett | Delt husholdning | Delt husholdning (refusjon) |
| finnkode | – | Salg (FINN o.l.) |
| reise, fly, hotell | Reise | Reise (refusjon) |

«(refusjon)» betyr samme utgiftskategori med positivt beløp, altså at forbruket går ned (seksjon 6). Ikke legg inn svært generelle ord som «felles». Det treffer «Felleskostnader» og gir falske dobbelttreff. Test hele nøkkelordlisten mot alle meldingene i fixtures: ingen rad skal få `lav_sikkerhet` uten at fasiten sier det.

## 8. Etterbehandling

- **Faste trekk og abonnementer.** Grupper på visningsnavnet fra ordboken når det finnes (`GOOGLE *YouTubePremium` og `GOOGLE*YOUTUBEPREMIUM` er samme tjeneste), ellers på butikknøkkel. KID-regninger grupperes på mottakerkonto. Sammenlign beløp i **originalvaluta** (ChatGPT koster USD 25 selv om kronebeløpet varierer), med ±10 % slingringsmonn. Intervaller: månedlig hvis mediangapet er 20–40 dager, ukentlig ved 5–9 dager, årlig ved 350–380 dager.
  - Krav: minst 3 trekk, eller minst 2 når ordboken sier `fast`.
  - Butikker med `fast` vises som faste allerede fra første trekk («ny»).
  - Varsle om prisendring (> 2 % i originalvaluta), om trekk som ser ut til å ha stoppet (ingen trekk på 1,5 × intervallet), og om **mulig dobbelttrekk**: samme faste butikk trukket to ganger innen 3 dager. Ekte eksempel: to Claude-trekk med én dags mellomrom.
  - Refunderte kjøp holdes utenfor.
- **Engangsposter.** Se seksjon 6.
- **Interne par.** Koble begge sidene av en intern overføring når begge finnes (samme beløp med motsatt fortegn, samme kontopar, samme dag). Det er bare til visning. Klassifiseringen må fungere uten paret.
- **Personer.** Motparter som ikke er firma, gruppert på kontonummer. Navnevarianter på samme konto blir alias (`Mia L Hansen` = `Mia Leietaker Hansen`). Ulike kontonumre med likt normalisert navn slås sammen (`B@RGE TESTESEN` og `Børge Testesen`), men jeg kan dele dem opp igjen. Personens visningsnavn er den vanligste navnevarianten. Ved likt antall vinner varianten med blandet store og små bokstaver. Transaksjoner med en person viser personens visningsnavn. Et navn regnes som firma når det har AS, ASA, SF, NUF, AB, BANK, N.V. o.l. eller treffer ordboken.

## 9. Oppsett første gang og «Sjekk disse»

Etter første import vises en kort veiviser som kan hoppes over og tas senere fra Innstillinger:

1. **Kontoer:** gjenkjente kontoer med navn og rolle (brukskonto, lønn, buffer, sparing, bolig/lån, forsikring). Rollen brukes til gruppering og ikoner.
2. **Personer:** personer med minst 3 transaksjoner eller minst 5 000 kr totalt. Vis sumlinjer per (person, retning, min konto), for eksempel:
   «Fra Mia → Bolig: 3 betalinger, 28 066 kr»
   «Fra Mia → Brukskonto: 1 betaling, 2 500 kr»
   «Til Mia: 6 betalinger, 8 910 kr»
   For hver linje velger jeg en kategori (hurtigvalg: Leieinntekt, Delt husholdning, Gaver og arv, Gaver gitt, Annet, La stå). Valget lagres som **personstandard** (prioritet 7). Nøkkelord i meldingen vinner fortsatt.
3. **Store engangsposter:** bekreft eller fjern flagget, og velg kategori for uavklarte store poster (hurtigvalg: Boligkjøp og egenkapital, Investering, Bil, Gaver gitt, Annet).
4. **Ukjente butikker:** de hyppigste ukjente butikknøklene, med valg av kategori (blir lærte koblinger).

**«Sjekk disse»** er en fast kø med Uavklart, `lav` sikkerhet, nye engangsposter, mulige dobbelttrekk, nye personer og import-advarsler. Hver rad har hurtigknapper. Når køen er tom, er alt i orden.

**Læring ved retting:** Når jeg endrer kategori på én transaksjon, vis et ark med valget «Gjelder alle fra *Xyzzy Handel*?» (standard ja). Ja lager en lært kobling. For personbetalinger lages en personstandard for samme retning og konto. «Bare denne» setter manuell kategori.

## 10. Skjermer (mobil først)

Bunnmeny: **Oversikt · Transaksjoner · Statistikk · Faste · Mer**. Store trykkflater (≥ 44 px), ark nedenfra for detaljer, sveip for å bytte måned, god enhåndsbruk, mørk modus etter systemet og tall med tabellsifre. Formatering: `Intl.NumberFormat('nb-NO')` («1 234,50 kr»), datoer som «6. nov.». Hver kategorigruppe har én fast farge som går igjen overalt, med tilstrekkelig kontrast i både lys og mørk modus. Bruk liggende stolper heller enn kakediagram på mobil.

- **Oversikt (måned):**
  - Inn, ut og netto spart, med sparerate
  - Normalt forbruk mot snittet for de siste 3 hele månedene
  - De største kategoriene som stolper
  - Kort for «Sjekk disse (n)» og banner for Uavklart
  - Total saldo og saldo per konto
  - Faste trekk per måned
  - Siste transaksjoner
  - Stor «Importer»-knapp, og «sist importert for X dager siden». Påminn etter 30 dager.
- **Transaksjoner:** liste gruppert per dag (virtualisert), søk, filtre (konto, kategori, inn/ut, periode, beløp, flagg) og «skjul interne overføringer» (på som standard). Trykk på en rad for detaljark med:
  - råtekst, kjøpsdato, kort og originalvaluta
  - konto og motpart
  - endre kategori (med læring)
  - splitte i flere kategorier eller beløp
  - notat, merkelapper og engangs av/på
  - koblet refusjon eller kjøp
- **Statistikk:**
  - Månedlige stablede stolper per gruppe (6 eller 12 måneder, normal og med engangs)
  - Drill-ned på gruppe og kategori, med trend og snitt
  - Topp butikker
  - Inntekt fordelt på kategori
  - Sparing og investering (Nordnet inn og ut, avdrag)
  - Faste mot variable utgifter
  - Saldo over tid (linje)
  - Velg periode: måned, kvartal, år eller egendefinert
- **Faste:** abonnementer og faste regninger. For hver: beløp, intervall, sist trukket og neste forventede trekk. Sum per måned og per år, merker (Ny, Prisendring, Mulig dobbelttrekk, Stoppet?), og mulighet til å skjule.
- **Mer:**
  - **Kontoer:** saldo og graf, rolle, navn, siste import
  - **Personer:** inn, ut og netto per måned, rolle, transaksjoner
  - **Kategorier** og **Regler:** redigering, prioritet, og «test regel» som viser hvor mange transaksjoner den treffer
  - **Import-historikk** med angre
  - **Sikkerhetskopi**
  - **Innstillinger:** terskel for engangs, «skjul beløp» (personvernmodus) og tema

Ytelse: Det skal gå helt jevnt på mobil med 50 000 transaksjoner. Bruk indekser i IndexedDB (`[accountId+statDate]`, `statDate`, `categoryId`, `merchantKey`) og aggregering i Worker med memoisering.

## 11. Lagring, sikkerhetskopi og personvern

- Dexie-skjema med versjonerte migreringer. Lagre: kontoer, transaksjoner (råfelt + normaliserte felt), splitter, kategorier, regler, lærte koblinger, personer, formatprofiler, importer og innstillinger.
- **Sikkerhetskopi:** eksporter alt til én JSON-fil med skjemaversjon. Den kan krypteres med passord: AES-GCM via WebCrypto, med nøkkel avledet med PBKDF2 (≥ 600 000 iterasjoner). Bruk delingsarket på mobil og nedlasting ellers. Gjenoppretting erstatter alt, etter bekreftelse. Minn om ny kopi etter 30 dager.
- Eksport av transaksjoner til CSV, kategorisert, for bruk i Excel.
- Ingen data i URL, logger eller konsoll.

## 12. PWA og publisering

- Manifest (navn, ikoner 192/512 + maskable, `display: standalone`, temafarge), apple-touch-icon og offline-cache av app-skallet. Lag et enkelt, pent eget ikon (SVG → PNG).
- Web Share Target (Android) for CSV-filer, via service worker. På iPhone importeres filene via Filer-appen. Det må fungere godt.
- GitHub Actions: installer, kjør `vitest` og `playwright` og bygg, og publiser til GitHub Pages hvis alt er grønt. Sett `base` riktig.
- `.gitignore` (følger med) blokkerer `*.csv` utenfor `tests/fixtures/` og mappen `private/`. Legg også inn en test som finner alle kontonumre i fixtures (`dddd dd ddddd`, `(ddddddddddd)` og 11 sifre på rad) og feiler hvis et av dem mangler i `tests/fixtures/tillatte-kontonumre.txt`. Da kan ikke ekte kontonumre snike seg inn.
- README på norsk:
  - slik eksporterer jeg CSV fra nettbanken
  - slik installerer jeg appen på iPhone (Del → Legg til på Hjem-skjerm, som er viktig for at data ikke slettes) og på Android
  - slik tar jeg sikkerhetskopi
  - slik kjører jeg prosjektet lokalt

## 13. Testdata og akseptansekriterier

`tests/fixtures/` inneholder:
- `eksport-1/` – fem filer, én per konto, eksportert 07.11.2026 (periode 07.11.2025–07.11.2026):
  - `…26.csv` Brukskonto (1111 22 33001, 75 rader)
  - `…_1.csv` Lønn (…33002, 5)
  - `…_2.csv` Bolig (…33003, 21)
  - `…_3.csv` Sparing (…33004, 6)
  - `…_4.csv` Forsikringer (…33005, 2)
- `eksport-2/Transaksjonsliste-12-10-26-10-11-26.csv` – ny eksport av Brukskonto 10.11.2026 som **overlapper** den første.
- `fasit.csv` – forventet resultat per rad, med semikolon og disse kolonnene:
  - `fil` og `rad` (radnummer blant transaksjonsradene, 1 = første rad under headeren)
  - `kategori`: forventet kategori **etter testoppsettet** nedenfor
  - `uten_oppsett`: forventet kategori før oppsettet
  - `flagg`: kommaseparert, blant `reservert`, `abonnement`, `mulig_dobbelttrekk`, `refundert`, `refusjon`, `engangs` og `lav_sikkerhet`. Testen skal kreve nøyaktig disse flaggene.
  - `navn`: forventet visningsnavn (tom = ikke sjekk)
  - `ny_ved_reimport`: bare for eksport-2. `ja` betyr at raden skal bli ny når den importeres etter eksport-1.
  - Raden med `kategori` som starter med `SPLITT:` forventer tre splitter: 4 972 / 8 467 / 70.
  - «abonnement» betyr at transaksjonen hører til et gjenkjent fast trekk.

**Testoppsett** (svarene i veiviseren, som personstandard):
- Personen «Mia Leietaker Hansen» har kontoene 2222 33 44001 og 2222 33 44002, med alias «Mia L Hansen».
- Fra Mia inn på Bolig → Leieinntekt
- Fra Mia inn på Brukskonto → Delt husholdning
- Til Mia → Delt husholdning

**Akseptansekriterier (automatiske tester):**

Import:
1. Alle seks filer leses uten feil. BOM, linjeskift inne i felt og bunntekst med U+00A0 håndteres.
2. Fem kontoer gjenkjennes med navnene Brukskonto, Lønn, Bolig, Sparing og Forsikringer. Forsikringer-filen har bare innkommende rader fra Bolig, men må likevel bli riktig konto. Eieren er «Ola Fiktiv Testesen».
3. Bunntekst-summene stemmer for alle filer. **Sparing** gir en saldo-advarsel: 0,00 + 200,00 ≠ 0,00, altså et avvik på 200,00 kr. Ingen andre filer gir advarsel.
4. Saldo etter eksport-1:
   - Brukskonto 13 576,35
   - Lønn 0,00
   - Bolig 25 773,33
   - Sparing 0,00 (bankens tall, med advarsel)
   - Forsikringer 10 000,00
5. Eksport-2 etter eksport-1: 43 rader, hvorav **38 duplikater**, **5 nye** og **2 reserverte erstattet**. Brukskonto har da 78 rader og saldo 12 976,95. Rader med `ny_ved_reimport = ja` er nøyaktig de nye.
6. De to helt identiske radene «12.10.2026 Overføring fra Bolig 3000» finnes **nøyaktig to ganger** i Brukskonto etter begge importene. Det samme gjelder speilradene i Bolig.
7. Å importere eksport-1 på nytt, både rett etter seg selv og etter eksport-2, gir 0 nye bokførte rader og endrer verken antall rader eller saldo. Rett etter seg selv blir de 2 reserverte radene erstattet med seg selv. Etter eksport-2 blir de hoppet over, fordi filen er eldre, så utdaterte reservasjoner kommer ikke tilbake.

Klassifisering:

8. Hver rad i `fasit.csv` får forventet kategori, flagg og visningsnavn, både med og uten testoppsettet (`uten_oppsett`).
9. Normalisering:
   - `B@RGE TESTESEN` → «BØRGE TESTESEN»
   - `Gave til boligkj|p p} Bryn` → «Gave til boligkjøp på Bryn»
   - `OPPGJ@R AV KONTO` → «OPPGJØR AV KONTO»
   - Kjøpsdato for `31.10 REMA STORGATA  OSLO` (utført 02.11.2026) er 31.10.2026
   - Enhetstest for årsskifte: `31.12` utført 02.01.2027 → 31.12.2026
   - OKQ8: originalbeløp SEK 535,23, kurs 0,9836, NOK −526,47
10. Refusjoner kobles: Steam 390 (kjøp 28.08 ↔ refusjon 05.09, bokført 07.09) og MacroFactor 899 (kjøp 17.10 ↔ refusjon 18.10). Netto blir 0 i kategorien.
11. Faste trekk som skal gjenkjennes:
    - YouTube Premium (269/mnd)
    - Prime Video (79/mnd)
    - Ad free for (29/mnd, tre ulike koder i teksten)
    - ChatGPT (USD 25/mnd)
    - Claude, med varsel om mulig dobbelttrekk 25.–26.10
    - Lyse Tele (539,69/mnd)
    - Fremtind (785,34)
    - Norsk Tipping abonnement (75)

    Steam, Elkjøp, Rema og andre butikker med varierende beløp skal **ikke** bli faste trekk.

**Oktober 2026** (statistikkdato, etter testoppsettet, med eksport-1):

| Forbruk | kr |
|---|---|
| Møbler og interiør | 23 998,50 |
| Elektronikk | 11 859,00 |
| Renter boliglån | 8 467,00 |
| Felleskostnader | 6 015,00 |
| Programvare og AI | 2 612,38 |
| Drivstoff | 2 413,41 |
| Dagligvarer | 1 691,90 |
| Strøm og nettleie | 1 600,00 |
| Forsikring | 785,34 |
| Internett og mobil | 539,69 |
| Delt husholdning | 500,00 |
| Strømmetjenester | 348,00 |
| Mat ute | 320,90 |
| Spill og apper | 300,00 |
| Sport og trening | 173,90 |
| Gebyrer | 130,15 |
| Helse og apotek | 87,70 |
| Kantine | 36,00 |
| **Sum forbruk** | **61 878,87** |
| herav engangs (Alna Møbel) | 21 999,50 |
| **Normalt forbruk** | **39 879,37** |

- Inntekt: Lønn 31 720,30 + Leieinntekt 13 000,00 + NAV og trygd 3 558,00 = **48 278,30**
- Sparing: Avdrag boliglån 4 972,00. Boligkjøp og egenkapital −2 078,68 (refusjon fra megler).
- Uavklart: −32,30 (Xyzzy Handel)
- Netto spart: **−13 600,57**

12. En Playwright-test i iPhone-visning importerer `eksport-1` gjennom grensesnittet, legger inn testoppsettet og sjekker at Oversikt for oktober 2026 viser sum forbruk, normalt forbruk og inntekt som over.

## 14. Arbeidsrekkefølge

Jobb i milepæler. Commit etter hver, og hold testene grønne:

1. Oppsett av prosjektet, CI og fixture-sjekk. **Kjerne:** parser, bunntekst, kontogjenkjenning, normalisering og butikknøkkel, med tester mot fixtures.
2. Database, import med dedupe og reservert-erstatning, validering, sammendrag og angre. Kriteriene 1–7.
3. Kategorier, ordbok, nøkkelord, personer, regler, læring og etterbehandling. Kriteriene 8–11.
4. Skjermene i seksjon 10 og aggregering. Oktober-tallene og kriterium 12.
5. Veiviser, «Sjekk disse», sikkerhetskopi med kryptering, PWA, Share Target, deploy og README.
6. Polering: ytelse med 50 000 syntetiske rader, tilgjengelighet, mørk modus og tomtilstander.

Ta fornuftige valg selv der dokumentet ikke sier noe, og skriv dem ned i `BESLUTNINGER.md`. Hvis et akseptansekriterium ser ut til å motsi resten av spesifikasjonen, si fra i stedet for å endre fasiten.

## 15. Ikke gjør dette

- Ikke legg ekte bankdata, ekte navn eller kontonumre i repoet. Lag ny testdata syntetisk.
- Ikke send data til noen tjeneste, heller ikke til AI-API-er for kategorisering.
- Ikke regn beløp med flyttall.
- Ikke dedupe reserverte rader på innhold, og ikke slå sammen identiske bokførte rader.
- Ikke tell interne overføringer, Nordnet-uttak eller overføringer fra egne kontoer i andre banker som inntekt.
- Ikke la klassifiseringen avhenge av at begge sider av en intern overføring er importert.
