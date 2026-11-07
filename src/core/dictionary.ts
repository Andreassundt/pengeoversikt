import { CAT } from './categories';

/**
 * Merchant dictionary (section 7.1). Patterns are regexes against FOLDED text (upper case,
 * Ø→OE, Æ→AE, Å→AA), matched after the date/provider prefix is removed but before numbers are
 * removed. Each alternative gets a word boundary in front unless it starts with "^".
 * More specific entries come first. Easy to extend: add a line.
 */
export interface DictEntry {
  /** Regex source; alternatives separated by "|". */
  p: string;
  cat: string;
  /** Canonical display name. */
  name?: string;
  /** Known subscription / fixed bill. */
  fast?: boolean;
  /** Fuel chain: special amount/subtype rule. */
  fuel?: boolean;
}

export const DICTIONARY: DictEntry[] = [
  // Dagligvarer
  { p: 'REMA', cat: CAT.dagligvarer, name: 'Rema 1000' },
  { p: 'KIWI', cat: CAT.dagligvarer, name: 'Kiwi' },
  { p: 'MENY', cat: CAT.dagligvarer, name: 'Meny' },
  { p: 'EXTRA', cat: CAT.dagligvarer, name: 'Coop Extra' },
  { p: 'COOP MEGA', cat: CAT.dagligvarer, name: 'Coop Mega' },
  { p: 'PRIX', cat: CAT.dagligvarer, name: 'Coop Prix' },
  { p: '^OBS\\b', cat: CAT.dagligvarer, name: 'Coop Obs' },
  { p: 'COOP', cat: CAT.dagligvarer, name: 'Coop' },
  { p: 'BUNNPRIS', cat: CAT.dagligvarer, name: 'Bunnpris' },
  { p: '^SPAR\\b', cat: CAT.dagligvarer, name: 'Spar' },
  { p: 'JOKER', cat: CAT.dagligvarer, name: 'Joker' },
  { p: '^ODA\\b', cat: CAT.dagligvarer, name: 'Oda' },
  { p: 'HOLDBART', cat: CAT.dagligvarer, name: 'Holdbart' },
  { p: 'NAERBUTIKKEN', cat: CAT.dagligvarer, name: 'Nærbutikken' },
  { p: 'SUPERMARK|SUPERMAR', cat: CAT.dagligvarer, name: 'Supermarked' },
  // Alkohol
  { p: 'VINMONOPOLET', cat: CAT.alkohol, name: 'Vinmonopolet' },
  // Mat ute
  { p: 'MCDONALDS|^MCD \\d', cat: CAT.matUte, name: "McDonald's" },
  { p: '^BK \\d|BURGER KING', cat: CAT.matUte, name: 'Burger King' },
  { p: 'MAX ?BURGERS', cat: CAT.matUte, name: 'Max Burgers' },
  { p: 'DOMINOS', cat: CAT.matUte, name: "Domino's" },
  { p: 'PEPPES', cat: CAT.matUte, name: 'Peppes Pizza' },
  { p: 'SUBWAY', cat: CAT.matUte, name: 'Subway' },
  { p: 'STARBUCKS', cat: CAT.matUte, name: 'Starbucks' },
  { p: 'ESPRESSO HOUSE', cat: CAT.matUte, name: 'Espresso House' },
  { p: 'WAYNES', cat: CAT.matUte, name: "Wayne's Coffee" },
  { p: 'FOODORA', cat: CAT.matUte, name: 'Foodora' },
  { p: '^WOLT', cat: CAT.matUte, name: 'Wolt' },
  { p: 'TOO GOOD TO GO', cat: CAT.matUte, name: 'Too Good To Go' },
  { p: '7-ELEVEN|7 ELEVEN', cat: CAT.matUte, name: '7-Eleven' },
  { p: 'NARVESEN', cat: CAT.matUte, name: 'Narvesen' },
  { p: 'DELI DE LUCA', cat: CAT.matUte, name: 'Deli de Luca' },
  { p: 'TURISTHYTTE|FJELLSTUE', cat: CAT.matUte },
  { p: '^KAFE\\b|^CAFE\\b|RESTAURANT', cat: CAT.matUte },
  // Kantine
  { p: 'ISS FACILITY|ISS FOOD', cat: CAT.kantine, name: 'ISS (kantine)' },
  { p: 'COMPASS GROUP', cat: CAT.kantine, name: 'Compass Group' },
  { p: 'SODEXO', cat: CAT.kantine, name: 'Sodexo' },
  { p: 'EUREST', cat: CAT.kantine, name: 'Eurest' },
  { p: 'KANTINE', cat: CAT.kantine },
  // Drivstoff (drivstoffkjeder)
  { p: '^ST1\\b', cat: CAT.drivstoff, name: 'St1', fuel: true },
  { p: 'CIRCLE K', cat: CAT.drivstoff, name: 'Circle K', fuel: true },
  { p: 'UNO-X', cat: CAT.drivstoff, name: 'Uno-X', fuel: true },
  { p: '^ESSO', cat: CAT.drivstoff, name: 'Esso', fuel: true },
  { p: '^SHELL', cat: CAT.drivstoff, name: 'Shell', fuel: true },
  { p: '^YX\\b', cat: CAT.drivstoff, name: 'YX', fuel: true },
  { p: 'OKQ8', cat: CAT.drivstoff, name: 'OKQ8', fuel: true },
  { p: '^PREEM', cat: CAT.drivstoff, name: 'Preem', fuel: true },
  { p: '^BEST\\b', cat: CAT.drivstoff, name: 'Best', fuel: true },
  { p: 'TESLA SUPERCHARG|IONITY|RECHARGE|FORTUM CHARGE', cat: CAT.drivstoff, fuel: true },
  // Bil og vedlikehold
  { p: 'BILVASK', cat: CAT.bil },
  { p: 'MEKONOMEN', cat: CAT.bil, name: 'Mekonomen' },
  { p: 'THANSEN', cat: CAT.bil, name: 'Thansen' },
  { p: 'VIANOR', cat: CAT.bil, name: 'Vianor' },
  { p: 'BILTEMA', cat: CAT.bil, name: 'Biltema' },
  { p: 'EU-KONTROLL|EU KONTROLL', cat: CAT.bil, name: 'EU-kontroll' },
  // Parkering og bom
  { p: 'EASYPARK', cat: CAT.parkering, name: 'EasyPark' },
  { p: 'APCOA', cat: CAT.parkering, name: 'Apcoa' },
  { p: 'ONEPARK', cat: CAT.parkering, name: 'Onepark' },
  { p: 'AIMO PARK', cat: CAT.parkering, name: 'Aimo Park' },
  { p: 'FJELLINJEN', cat: CAT.parkering, name: 'Fjellinjen' },
  { p: '^FERDE', cat: CAT.parkering, name: 'Ferde' },
  { p: 'AUTOPASS', cat: CAT.parkering, name: 'AutoPASS' },
  { p: 'BOMPENGER', cat: CAT.parkering },
  // Kollektivtransport
  { p: '^RUTER', cat: CAT.kollektiv, name: 'Ruter' },
  { p: '^VY\\b', cat: CAT.kollektiv, name: 'Vy' },
  { p: 'FLYTOGET', cat: CAT.kollektiv, name: 'Flytoget' },
  { p: 'ENTUR', cat: CAT.kollektiv, name: 'Entur' },
  { p: '^ATB\\b', cat: CAT.kollektiv, name: 'AtB' },
  { p: '^SKYSS', cat: CAT.kollektiv, name: 'Skyss' },
  { p: 'KOLUMBUS', cat: CAT.kollektiv, name: 'Kolumbus' },
  { p: 'BRAKAR', cat: CAT.kollektiv, name: 'Brakar' },
  { p: '^BOLT\\b', cat: CAT.kollektiv, name: 'Bolt' },
  { p: '^UBER', cat: CAT.kollektiv, name: 'Uber' },
  { p: 'TAXI', cat: CAT.kollektiv },
  // Møbler og interiør
  { p: 'IKEA', cat: CAT.mobler, name: 'IKEA' },
  { p: 'ALNA MOEBEL', cat: CAT.mobler, name: 'Alna Møbel' },
  { p: 'SKOUSEN', cat: CAT.mobler, name: 'Skousen' },
  { p: '^KID \\d|KID INTERIOER', cat: CAT.mobler, name: 'Kid Interiør' },
  { p: 'JERNIA', cat: CAT.mobler, name: 'Jernia' },
  { p: 'CLAS ?OHL(SON)?', cat: CAT.mobler, name: 'Clas Ohlson' },
  { p: '^RUSTA\\b', cat: CAT.mobler, name: 'Rusta' },
  { p: 'SOESTRENE GRENE', cat: CAT.mobler, name: 'Søstrene Grene' },
  { p: 'KITCHN|KITCHENTIME|KOKKEGLEDE', cat: CAT.mobler },
  { p: 'KONTORSENTERET', cat: CAT.mobler, name: 'Kontorsenteret' },
  { p: 'JYSK', cat: CAT.mobler, name: 'JYSK' },
  { p: 'BOHUS', cat: CAT.mobler, name: 'Bohus' },
  { p: 'SKEIDAR', cat: CAT.mobler, name: 'Skeidar' },
  { p: 'FAGMOEBLER', cat: CAT.mobler, name: 'Fagmøbler' },
  { p: 'HABITAT', cat: CAT.mobler, name: 'Habitat' },
  { p: 'TILBORDS', cat: CAT.mobler, name: 'Tilbords' },
  { p: '^CHILLI\\b', cat: CAT.mobler, name: 'Chilli' },
  { p: 'JULA', cat: CAT.mobler, name: 'Jula' },
  { p: 'EUROPRIS', cat: CAT.mobler, name: 'Europris' },
  { p: '^NILLE', cat: CAT.mobler, name: 'Nille' },
  { p: 'MAXBO', cat: CAT.mobler, name: 'Maxbo' },
  { p: 'BYGGMAX', cat: CAT.mobler, name: 'Byggmax' },
  { p: '^MONTER', cat: CAT.mobler, name: 'Monter' },
  { p: 'OPTIMERA', cat: CAT.mobler, name: 'Optimera' },
  { p: 'PLANTASJEN', cat: CAT.mobler, name: 'Plantasjen' },
  { p: 'HAGELAND', cat: CAT.mobler, name: 'Hageland' },
  { p: 'FLUGGER', cat: CAT.mobler, name: 'Flügger' },
  // Elektronikk
  { p: 'ELKJOEP', cat: CAT.elektronikk, name: 'Elkjøp' },
  { p: '^POWER\\b', cat: CAT.elektronikk, name: 'Power' },
  { p: 'KOMPLETT', cat: CAT.elektronikk, name: 'Komplett' },
  { p: 'NETONNET', cat: CAT.elektronikk, name: 'NetOnNet' },
  { p: 'COMPUTERSALG', cat: CAT.elektronikk, name: 'Computersalg' },
  { p: 'TEKNIKMAGASINET', cat: CAT.elektronikk, name: 'Teknikmagasinet' },
  { p: 'TEKNIKDELAR', cat: CAT.elektronikk, name: 'Teknikdelar' },
  { p: '^CDON', cat: CAT.elektronikk, name: 'CDON' },
  { p: 'PROSHOP', cat: CAT.elektronikk, name: 'Proshop' },
  { p: 'DUSTIN', cat: CAT.elektronikk, name: 'Dustin' },
  { p: 'KJELL ?&? ?COMPANY', cat: CAT.elektronikk, name: 'Kjell & Company' },
  // Klær og sko
  { p: '^H ?& ?M\\b', cat: CAT.klaer, name: 'H&M' },
  { p: '^ZARA', cat: CAT.klaer, name: 'Zara' },
  { p: 'DRESSMANN', cat: CAT.klaer, name: 'Dressmann' },
  { p: 'CUBUS', cat: CAT.klaer, name: 'Cubus' },
  { p: 'CARLINGS', cat: CAT.klaer, name: 'Carlings' },
  { p: 'KAPPAHL', cat: CAT.klaer, name: 'KappAhl' },
  { p: 'LINDEX', cat: CAT.klaer, name: 'Lindex' },
  { p: 'BIK BOK', cat: CAT.klaer, name: 'Bik Bok' },
  { p: 'JACK ?& ?JONES', cat: CAT.klaer, name: 'Jack & Jones' },
  { p: 'SKORINGEN', cat: CAT.klaer, name: 'Skoringen' },
  { p: 'EURO ?SKO', cat: CAT.klaer, name: 'Eurosko' },
  { p: 'NILSON', cat: CAT.klaer, name: 'Nilson' },
  { p: 'BOOZT', cat: CAT.klaer, name: 'Boozt' },
  { p: 'ZALANDO', cat: CAT.klaer, name: 'Zalando' },
  { p: '^ASOS', cat: CAT.klaer, name: 'ASOS' },
  { p: 'SHEIN', cat: CAT.klaer, name: 'Shein' },
  // Pleie og kosmetikk
  { p: '^KICKS\\b', cat: CAT.pleie, name: 'Kicks' },
  { p: '^VITA\\b', cat: CAT.pleie, name: 'Vita' },
  { p: '^NORMAL\\b', cat: CAT.pleie, name: 'Normal' },
  { p: 'CUTTERS', cat: CAT.pleie, name: 'Cutters' },
  { p: 'FRISOER', cat: CAT.pleie },
  // Helse og apotek
  { p: 'APOTEK 1', cat: CAT.helse, name: 'Apotek 1' },
  { p: 'VITUSAPOTEK', cat: CAT.helse, name: 'Vitusapotek' },
  { p: 'APOTEK|APOTE\\b', cat: CAT.helse, name: 'Apotek' },
  { p: '^BOOTS', cat: CAT.helse, name: 'Boots' },
  { p: 'FYSIO', cat: CAT.helse },
  { p: 'LEGESENTER|LEGEVAKT', cat: CAT.helse },
  { p: 'TANNLEGE|TANNHELSE', cat: CAT.helse },
  { p: 'SPECSAVERS', cat: CAT.helse, name: 'Specsavers' },
  { p: 'BRILLEOPTIKK', cat: CAT.helse },
  { p: 'OPTIKER', cat: CAT.helse },
  // Sport og trening
  { p: '^XXL\\b', cat: CAT.sport, name: 'XXL' },
  { p: '^SPORT ?1\\b', cat: CAT.sport, name: 'Sport 1' },
  { p: 'INTERSPORT', cat: CAT.sport, name: 'Intersport' },
  { p: '^G-SPORT|^G SPORT', cat: CAT.sport, name: 'G-Sport' },
  { p: 'ANTON SPORT', cat: CAT.sport, name: 'Anton Sport' },
  { p: 'IDRETTSFORBUND', cat: CAT.sport, name: 'Norges idrettsforbund' },
  { p: 'HOEOEKS', cat: CAT.sport, name: 'Hööks' },
  { p: '^SATS\\b', cat: CAT.sport, name: 'SATS' },
  { p: '^EVO\\b', cat: CAT.sport, name: 'EVO' },
  { p: 'FRESH FITNESS', cat: CAT.sport, name: 'Fresh Fitness' },
  { p: 'ELIXIA', cat: CAT.sport, name: 'Elixia' },
  { p: 'DECATHLON', cat: CAT.sport, name: 'Decathlon' },
  { p: 'LOEPLABBET', cat: CAT.sport, name: 'Løplabbet' },
  // Spill og apper
  { p: 'STEAM', cat: CAT.spill, name: 'Steam' },
  { p: 'BATTLE\\.NET|BLIZZARD', cat: CAT.spill, name: 'Battle.net' },
  { p: 'ROBLOX', cat: CAT.spill, name: 'Roblox' },
  { p: 'GOOGLE PLAY', cat: CAT.spill, name: 'Google Play' },
  { p: 'PLAYSTATION|SONY INTERACTIVE', cat: CAT.spill, name: 'PlayStation' },
  { p: 'NINTENDO', cat: CAT.spill, name: 'Nintendo' },
  { p: 'XBOX', cat: CAT.spill, name: 'Xbox' },
  { p: 'EPIC GAMES', cat: CAT.spill, name: 'Epic Games' },
  { p: '^GOG', cat: CAT.spill, name: 'GOG' },
  // Hobby
  { p: 'GIGABOKS', cat: CAT.hobby, name: 'Gigaboks' },
  { p: 'SPILLOTEKET', cat: CAT.hobby, name: 'Spilloteket' },
  { p: 'OUTLAND', cat: CAT.hobby, name: 'Outland' },
  { p: 'PANDURO', cat: CAT.hobby, name: 'Panduro' },
  // Kultur og underholdning
  { p: 'ODEON', cat: CAT.kultur, name: 'Odeon Kino' },
  { p: 'NORDISK FILM|^NF KINO|KINO', cat: CAT.kultur },
  { p: 'TICKETMASTER', cat: CAT.kultur, name: 'Ticketmaster' },
  { p: 'BILLETTSERVICE', cat: CAT.kultur, name: 'Billettservice' },
  { p: '^TIX\\b', cat: CAT.kultur, name: 'TIX' },
  { p: '^NORLI\\b', cat: CAT.kultur, name: 'Norli' },
  { p: '^ARK\\b', cat: CAT.kultur, name: 'ARK' },
  { p: 'TANUM', cat: CAT.kultur, name: 'Tanum' },
  { p: 'ADLIBRIS', cat: CAT.kultur, name: 'Adlibris' },
  // Reise
  { p: '^SAS\\b', cat: CAT.reise, name: 'SAS' },
  { p: 'NORWEGIAN AIR', cat: CAT.reise, name: 'Norwegian' },
  { p: 'WIDEROE', cat: CAT.reise, name: 'Widerøe' },
  { p: 'BOOKING\\.COM', cat: CAT.reise, name: 'Booking.com' },
  { p: 'AIRBNB', cat: CAT.reise, name: 'Airbnb' },
  { p: 'HOTELS\\.COM', cat: CAT.reise, name: 'Hotels.com' },
  { p: 'EXPEDIA', cat: CAT.reise, name: 'Expedia' },
  { p: 'SCANDIC', cat: CAT.reise, name: 'Scandic' },
  { p: '^THON\\b', cat: CAT.reise, name: 'Thon Hotels' },
  { p: 'STRAWBERRY', cat: CAT.reise, name: 'Strawberry' },
  { p: 'RADISSON', cat: CAT.reise, name: 'Radisson' },
  // Lotteri og pengespill
  { p: 'NORSK TIPPING', cat: CAT.lotteri, name: 'Norsk Tipping' },
  { p: 'RIKSTOTO', cat: CAT.lotteri, name: 'Rikstoto' },
  // Strømmetjenester (fast)
  { p: 'YOUTUBE ?PREMIUM', cat: CAT.strommetjenester, name: 'YouTube Premium', fast: true },
  { p: 'PRIME VIDEO|AMAZON PRIME', cat: CAT.strommetjenester, name: 'Prime Video', fast: true },
  { p: 'NETFLIX', cat: CAT.strommetjenester, name: 'Netflix', fast: true },
  { p: 'SPOTIFY', cat: CAT.strommetjenester, name: 'Spotify', fast: true },
  { p: 'VIAPLAY', cat: CAT.strommetjenester, name: 'Viaplay', fast: true },
  { p: 'TV ?2 PLAY', cat: CAT.strommetjenester, name: 'TV 2 Play', fast: true },
  { p: 'DISNEY', cat: CAT.strommetjenester, name: 'Disney+', fast: true },
  { p: '^HBO|^MAX\\b', cat: CAT.strommetjenester, name: 'Max', fast: true },
  { p: 'APPLE TV', cat: CAT.strommetjenester, name: 'Apple TV', fast: true },
  { p: 'STORYTEL', cat: CAT.strommetjenester, name: 'Storytel', fast: true },
  { p: 'BOOKBEAT', cat: CAT.strommetjenester, name: 'BookBeat', fast: true },
  { p: 'AUDIBLE', cat: CAT.strommetjenester, name: 'Audible', fast: true },
  { p: 'TIDAL', cat: CAT.strommetjenester, name: 'Tidal', fast: true },
  // Programvare og AI (fast)
  { p: 'OPENAI|CHATGPT', cat: CAT.programvare, name: 'ChatGPT', fast: true },
  { p: 'ANTHROPIC|CLAUDE', cat: CAT.programvare, name: 'Claude', fast: true },
  { p: 'MICROSOFT|MSFT', cat: CAT.programvare, name: 'Microsoft', fast: true },
  { p: 'ADOBE', cat: CAT.programvare, name: 'Adobe', fast: true },
  { p: 'DROPBOX', cat: CAT.programvare, name: 'Dropbox', fast: true },
  { p: 'GOOGLE ONE', cat: CAT.programvare, name: 'Google One', fast: true },
  { p: 'APPLE\\.COM/BILL|ICLOUD', cat: CAT.programvare, name: 'Apple', fast: true },
  { p: 'GITHUB', cat: CAT.programvare, name: 'GitHub', fast: true },
  { p: 'DOMENESHOP', cat: CAT.programvare, name: 'Domeneshop', fast: true },
  { p: 'MACROFACTO', cat: CAT.programvare, name: 'MacroFactor', fast: true },
  { p: '^AD FREE FOR', cat: CAT.programvare, name: 'Ad free for', fast: true },
  // Internett og mobil (fast)
  { p: 'LYSE TELE', cat: CAT.internett, name: 'Lyse Tele', fast: true },
  { p: 'ALTIBOX', cat: CAT.internett, name: 'Altibox', fast: true },
  { p: 'TELENOR', cat: CAT.internett, name: 'Telenor', fast: true },
  { p: 'TELIA', cat: CAT.internett, name: 'Telia', fast: true },
  { p: '^ICE\\b', cat: CAT.internett, name: 'Ice', fast: true },
  { p: 'TALKMORE', cat: CAT.internett, name: 'Talkmore', fast: true },
  { p: 'CHILI MOBIL', cat: CAT.internett, name: 'Chili Mobil', fast: true },
  { p: 'ONECALL', cat: CAT.internett, name: 'OneCall', fast: true },
  { p: 'ALLENTE', cat: CAT.internett, name: 'Allente', fast: true },
  // Strøm og nettleie (fast)
  { p: 'TIBBER', cat: CAT.strom, name: 'Tibber', fast: true },
  { p: 'FJORDKRAFT', cat: CAT.strom, name: 'Fjordkraft', fast: true },
  { p: 'HAFSLUND', cat: CAT.strom, name: 'Hafslund', fast: true },
  { p: 'ELVIA', cat: CAT.strom, name: 'Elvia', fast: true },
  { p: 'LYSE ENERGI|LYSE NETT', cat: CAT.strom, name: 'Lyse', fast: true },
  { p: 'NORGESENERGI', cat: CAT.strom, name: 'NorgesEnergi', fast: true },
  { p: 'TENSIO', cat: CAT.strom, name: 'Tensio', fast: true },
  { p: 'GLITRE', cat: CAT.strom, name: 'Glitre', fast: true },
  // Forsikring (fast)
  { p: 'FREMTIND', cat: CAT.forsikring, name: 'Fremtind', fast: true },
  { p: 'GJENSIDIGE', cat: CAT.forsikring, name: 'Gjensidige', fast: true },
  { p: '^IF SKADE', cat: CAT.forsikring, name: 'If', fast: true },
  { p: '^TRYG\\b', cat: CAT.forsikring, name: 'Tryg', fast: true },
  { p: 'STOREBRAND', cat: CAT.forsikring, name: 'Storebrand', fast: true },
  { p: 'FRENDE', cat: CAT.forsikring, name: 'Frende', fast: true },
  { p: 'CODAN', cat: CAT.forsikring, name: 'Codan', fast: true },
  // Gebyrer
  { p: 'GEBYR VIPPS', cat: CAT.gebyrer, name: 'Vipps-gebyr' },
  { p: 'GEBYR', cat: CAT.gebyrer },
  { p: 'AARSAVGIFT', cat: CAT.gebyrer },
  { p: 'TERMINGEBYR', cat: CAT.gebyrer },
  // Kontantuttak
  { p: 'MINIBANK', cat: CAT.kontantuttak, name: 'Minibank' },
  { p: 'KONTANTUTTAK', cat: CAT.kontantuttak, name: 'Kontantuttak' },
  { p: '^ATM\\b', cat: CAT.kontantuttak, name: 'Minibank' },
  // Investering
  { p: 'NORDNET', cat: CAT.investering, name: 'Nordnet' },
  { p: '^KRON\\b', cat: CAT.investering, name: 'Kron' },
  { p: '^FIRI\\b', cat: CAT.investering, name: 'Firi' },
  // Revolut-påfyll
  { p: 'REVOLUT', cat: CAT.revolut, name: 'Revolut' },
  // Boligkjøp og egenkapital
  { p: 'EIENDOMSMEGL|PRIVATMEGLEREN|KROGSVEEN|NORDVIK|EIENDOMSMEGLER 1', cat: CAT.boligkjop },
];

export interface DictMatch {
  entry: DictEntry;
  categoryId: string;
  name: string | null;
  fast: boolean;
  fuel: boolean;
}

interface Compiled {
  re: RegExp;
  entry: DictEntry;
}

function compile(entry: DictEntry): Compiled {
  const alternatives = entry.p.split('|').map((alt) => (alt.startsWith('^') ? alt : `\\b${alt}`));
  return { re: new RegExp(alternatives.join('|')), entry };
}

const COMPILED: Compiled[] = DICTIONARY.map(compile);

/** Matches folded merchant text against the dictionary. First hit wins. */
export function matchDictionary(foldedText: string): DictMatch | null {
  if (!foldedText) return null;
  for (const c of COMPILED) {
    if (c.re.test(foldedText)) {
      return {
        entry: c.entry,
        categoryId: c.entry.cat,
        name: c.entry.name ?? null,
        fast: c.entry.fast === true,
        fuel: c.entry.fuel === true,
      };
    }
  }
  return null;
}

/** Text that itself says "subscription". */
export function hasSubscriptionHint(foldedText: string): boolean {
  return /ABONNEMENT|SUBSCR| SUB$/.test(foldedText);
}
