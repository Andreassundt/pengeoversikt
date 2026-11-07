# Testdata (syntetisk)

Alle navn, kontonumre, steder og beløp er oppdiktet. Formatet er en nøyaktig kopi av ekte bankeksport:
UTF-8 med BOM, semikolon, linjeskift inne i anførselstegn, bunntekst med hardt mellomrom (U+00A0) og reserverte rader.

| Mappe / fil | Innhold |
|---|---|
| `eksport-1/Transaksjonsliste-07-11-25-07-11-26.csv` | Brukskonto 1111 22 33001, 75 rader |
| `eksport-1/…_1.csv` | Lønn 1111 22 33002, 5 rader |
| `eksport-1/…_2.csv` | Bolig 1111 22 33003, 21 rader |
| `eksport-1/…_3.csv` | Sparing 1111 22 33004, 6 rader. Bunnteksten har bevisst saldoavvik på 200 kr. |
| `eksport-1/…_4.csv` | Forsikringer 1111 22 33005, 2 rader. Bare innkommende fra Bolig. |
| `eksport-2/Transaksjonsliste-12-10-26-10-11-26.csv` | Ny Brukskonto-eksport som overlapper eksport-1 (38 duplikater, 5 nye, 2 reserverte erstattet) |
| `fasit.csv` | Forventet kategori, flagg og visningsnavn per rad (se PROMPT.md, seksjon 13) |
| `tillatte-kontonumre.txt` | Alle kontonumre som får forekomme i fixtures |

Ikke endre disse filene. Ny testdata lages i egne filer.
