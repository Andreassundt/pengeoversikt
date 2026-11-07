# Beslutninger

Valg som ikke står eksplisitt i PROMPT.md, med begrunnelse. Oppdateres per milepæl.

## Milepæl 1 – oppsett og kjerne

- **Verktøyversjoner:** Vite 8, React 19, TypeScript 7, Tailwind 4 (`@tailwindcss/vite`), Dexie 4, Vitest 5, Playwright, vite-plugin-pwa 2 med `injectManifest` (egen `src/sw.ts`, nødvendig for Web Share Target).
- **Ingen inline-skript:** Service worker registreres fra `main.tsx` (`virtual:pwa-register`), ikke med injisert `<script>`, slik at CSP kan være `script-src 'self'`. `style-src` har `'unsafe-inline'` fordi Vite i utviklingsmodus injiserer `<style>`-elementer; det åpner ikke for skript.
- **Tre tsconfig-er:** app (DOM), worker/service worker (WebWorker-lib) og node (konfigfiler). DOM- og WebWorker-libene kan ikke kombineres i samme prosjekt.
- **Kanonisk radformat:** Alle formater konverteres til bankens 15 felt («RAW»-indekser i `src/core/types.ts`). Et generisk kolonnekart (`src/core/formats/generic.ts`) lager de samme 15 feltene, så alt nedstrøms er formatuavhengig. Veiviseren for kolonnekart kommer i milepæl 5.
- **Beløp:** Strenger splittes på desimaltegn og regnes om til øre som heltall. `parseAmountDot` for rader (punktum), `parseAmountNo` for bunntekst og lånemeldinger (komma, punktum/mellomrom/U+00A0 som tusenskille). Formatering bygger strengen av heltallsdel og øre separat, så ingen flyttall er involvert.
- **Datoer:** ISO-strenger (`yyyy-mm-dd`) overalt internt, fordi de kan sammenlignes leksikalsk og lagres/indekseres rett i IndexedDB.
- **Feltene trimmes** (og CRLF inne i felt blir LF) før de lagres som råfelt. Dedupe-nøkkelen bygges av de trimmede feltene, så den er stabil på tvers av små forskjeller i linjeskift.
- **7-bits-fiks:** `@` byttes bare mellom to store bokstaver og aldri i strenger som ser ut som e-postadresser. `}|{[]\` byttes bare når tegnet står inntil en bokstav.
- **Motpartsnavn** for kortkjøp er beskrivelsen (uten datoprefiks); det egentlige butikknavnet ligger i `merchantText`/`displayName`. Beskrivelser av typen «Til konto: 1111 22 33004» gir tomt motpartsnavn, slik at de ikke blir «personer».
- **Butikknøkkel:** Koder som starter med `*` og inneholder siffer fjernes også inne i tokens («Revolut**1122*» → «REVOLUT»). Rene tall/koder (`^[\d.\-/:,]+$`) fjernes, men tokens med bokstaver og siffer (`ST1`, `7-ELEVEN`) beholdes. Stjerner fjernes fra nøkkelen, så `GOOGLE *YouTubePremium` og `GOOGLE*YOUTUBEPREMIUM` får samme nøkkel.
- **Eier:** Vanligste `Avsender` på *bokførte* kortkjøp (reserverte rader har kontonavnet som avsender). Finnes ingen kortkjøp, brukes vanligste `Mottakernavn` på innbetalinger.
- **Fixture-sjekken** leter også etter kontonumre med punktum (`1111.22.33001`), som forekommer i meldinger.

## Milepæl 2 – database og import

- **Splitter lagres på transaksjonen** (`splits: Split[] | null`) i stedet for i egen tabell. De er små, alltid lest sammen med raden, og aggregering trenger dem i samme omgang.
- **Import i to faser:** `prepareImport` leser databasen og lager en plan (ingen skriving); `commitImport` skriver planen i én Dexie-transaksjon. Flere filer i samme batch kan gjelde samme konto, så planen holder løpende dedupe-tellinger og reserverte rader per konto mens den går gjennom filene.
- **Hvilke av identiske rader som blir «nye»:** Ved n forekomster i filen og m i databasen settes de første n−m som nye; resten er duplikater. Radene er identiske, så valget har ingen betydning for dataene.
- **Reservert-erstatning** bruker filens periode fra bunnteksten; mangler bunntekst, brukes første og siste raddato. «Minst like ny» betyr sluttdato ≥ kontoens siste importerte sluttdato, så en ny eksport samme dag erstatter reservasjonene.
- **Saldo-anker:** Kontoens saldo settes fra bunnteksten når filens sluttdato er ≥ datoen for gjeldende anker. En eldre fil endrer verken saldo eller «siste import».
- **Angre** gjelder hele siste batch (alle filer importert sammen): slettede rader fjernes, erstattede reserverte rader legges tilbake med sine gamle id-er, kontoens forrige saldo/dato gjenopprettes, og kontoer som ble opprettet av batchen og nå er tomme, slettes.
- **Kontonavn** tas fra «Overføring til egen konto» på tvers av alle filer i batchen og allerede lagrede kontoer. En konto uten kjent navn får kontonummeret som navn til et navn dukker opp (eller settes manuelt).
- **Eiernavn** lagres i innstillinger første gang det oppdages og endres ikke automatisk etterpå.
- **Klassifisering i milepæl 2** har bare de strukturelle reglene (intern overføring, egen konto i annen bank, lønn/NAV, lånesplitt, omkostninger); resten er «Uavklart» til milepæl 3.

## Milepæl 3 – klassifisering og etterbehandling

- **Ordboken** (`src/core/dictionary.ts`) er en flat datafil. Hvert mønster får `\b` foran hvert alternativ med mindre det starter med `^`. Entries uten kanonisk navn (f.eks. `RESTAURANT`, `FYSIO`) gir kategori, men visningsnavnet blir den rensede teksten i pen skrivemåte.
- **Ordbok mot ikke-kortrader** prøves først mot motpartsnavnet, så mot beskrivelsen (uten datoprefiks og kontosuffiks). Aldri mot `Melding`, bortsett fra butikkdelen i kortmeldingen (den ligger allerede i `dictText`).
- **Nøkkelord** gjelder bare rader som ikke er kortkjøp. Et ukjent kortkjøp blir «Uavklart» og læres via retting, i stedet for å gjette fra butikkteksten.
- **«lav sikkerhet»-flagget** settes bare når en kategori faktisk er valgt med lav sikkerhet. «Uavklart» har sin egen kø og får ikke flagget i tillegg (fasiten har ingen Uavklart-rader med `lav_sikkerhet`).
- **Refusjon (Kreditoverføring)** klassifiseres først via ordboken på butikkteksten i meldingen; etterbehandlingen finner kjøpet (samme butikknøkkel, samme beløp, inntil 60 dager før) og kopierer kategorien. Kobling lagres som `linkedTxId` begge veier.
- **Personer** er motparter på vanlige betalinger: ikke kortkjøp, ikke rader som treffes av strukturelle regler (overføringer, lønn, lån, omkostninger), ikke eieren, ikke firma (AS/ASA/AB/BANK/N.V. osv. eller ordbokstreff). Navnet må komme fra et navnefelt eller være støttet av et kontonummer, så beskrivelser som «Mobilgiro m/melding» ikke blir personer. Grupper slås sammen når de deler kontonummer eller normalisert navn (union-find). Deling lagres som `noMerge`-navn på begge personene.
- **Personens visningsnavn** regnes om ved hver reklassifisering (vanligste variant, blandet store/små bokstaver vinner ved likt antall) med mindre brukeren har gitt eget navn (`role = 'custom-name'`).
- **Faste trekk:** kandidater er utgifter (`kind = expense`) med negativt beløp som ikke er refundert. Gruppe = kanonisk navn fra ordboken, ellers mottakerkonto for KID-regninger, ellers butikknøkkel. Referansebeløpet er det beløpet som har flest naboer innenfor ±10 % (i originalvaluta); medlemmene er naboene. Butikker merket `fast` (eller tekst med ABONNEMENT/SUBSCR/SUB) er faste fra første trekk; andre krever minst 3 trekk *og* et gjenkjent intervall, slik at tre tilfeldige like kjøp ikke blir et abonnement. Ukjent intervall behandles som månedlig i summene.
- **Engangsposter** respekterer en manuell overstyring (`oneOffOverride`), ellers terskelen fra innstillingene.
- **Interne par** kobles på dato, beløp og byttede kontonumre; brukes bare til visning.
- **Retting:** «Gjelder alle» lager en lært kobling (eller personstandard for personbetalinger) og låser *ikke* raden, slik at reglene fortsatt styrer. «Bare denne» setter `manual = true`, som reklassifiseringen aldri rører. Alle handlinger i `src/db/actions.ts` er rene skrivinger; reklassifiseringen kjøres etterpå (i en Worker fra grensesnittet, direkte i testene).
- **Reklassifisering** kjører alltid over alle rader (ikke-manuelle klassifiseres på nytt, personer synkroniseres, etterbehandling kjøres) og skriver bare rader der noe faktisk endret seg.
