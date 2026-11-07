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
