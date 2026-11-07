import type { Category, CategoryGroup, Kind } from './types';

/** Stable category ids used by the classifier. Names can be changed by the user. */
export const CAT = {
  lonn: 'lonn',
  nav: 'nav',
  leieinntekt: 'leieinntekt',
  salg: 'salg',
  gaverArv: 'gaver-arv',
  annenInntekt: 'annen-inntekt',
  renter: 'renter-boliglan',
  felleskostnader: 'felleskostnader',
  strom: 'strom',
  husleie: 'husleie',
  forsikring: 'forsikring',
  mobler: 'mobler',
  dagligvarer: 'dagligvarer',
  matUte: 'mat-ute',
  kantine: 'kantine',
  alkohol: 'alkohol',
  drivstoff: 'drivstoff',
  bil: 'bil',
  kollektiv: 'kollektiv',
  parkering: 'parkering',
  elektronikk: 'elektronikk',
  klaer: 'klaer',
  pleie: 'pleie',
  spill: 'spill',
  hobby: 'hobby',
  sport: 'sport',
  kultur: 'kultur',
  reise: 'reise',
  lotteri: 'lotteri',
  strommetjenester: 'strommetjenester',
  programvare: 'programvare',
  internett: 'internett',
  helse: 'helse',
  deltHusholdning: 'delt-husholdning',
  gaverGitt: 'gaver-gitt',
  gebyrer: 'gebyrer',
  kontantuttak: 'kontantuttak',
  revolut: 'revolut',
  annet: 'annet',
  investering: 'investering',
  avdrag: 'avdrag',
  boligkjop: 'boligkjop',
  intern: 'intern',
  egenAnnenBank: 'egen-annen-bank',
  uavklart: 'uavklart',
} as const;

export type CategoryId = (typeof CAT)[keyof typeof CAT];

export const DEFAULT_GROUPS: CategoryGroup[] = [
  { id: 'inntekt', name: 'Inntekt', color: '#16a34a', order: 1 },
  { id: 'bolig', name: 'Bolig', color: '#2563eb', order: 2 },
  { id: 'hjem', name: 'Hjem', color: '#d97706', order: 3 },
  { id: 'mat', name: 'Mat og drikke', color: '#ea580c', order: 4 },
  { id: 'transport', name: 'Transport', color: '#0891b2', order: 5 },
  { id: 'shopping', name: 'Shopping', color: '#db2777', order: 6 },
  { id: 'fritid', name: 'Fritid', color: '#7c3aed', order: 7 },
  { id: 'abonnementer', name: 'Abonnementer', color: '#4f46e5', order: 8 },
  { id: 'helse', name: 'Helse', color: '#dc2626', order: 9 },
  { id: 'annet', name: 'Annet', color: '#64748b', order: 10 },
  { id: 'sparing', name: 'Sparing og investering', color: '#0d9488', order: 11 },
  { id: 'overforinger', name: 'Overføringer', color: '#94a3b8', order: 12 },
  { id: 'uavklart', name: 'Uavklart', color: '#ca8a04', order: 13 },
];

function cat(id: string, name: string, groupId: string, kind: Kind, order: number, icon: string): Category {
  return { id, name, groupId, kind, order, icon, hidden: false };
}

export const DEFAULT_CATEGORIES: Category[] = [
  cat(CAT.lonn, 'Lønn', 'inntekt', 'income', 1, '💼'),
  cat(CAT.nav, 'NAV og trygd', 'inntekt', 'income', 2, '🏛️'),
  cat(CAT.leieinntekt, 'Leieinntekt', 'inntekt', 'income', 3, '🔑'),
  cat(CAT.salg, 'Salg (FINN o.l.)', 'inntekt', 'income', 4, '🏷️'),
  cat(CAT.gaverArv, 'Gaver og arv', 'inntekt', 'income', 5, '🎁'),
  cat(CAT.annenInntekt, 'Annen inntekt', 'inntekt', 'income', 6, '💰'),
  cat(CAT.renter, 'Renter boliglån', 'bolig', 'expense', 10, '🏦'),
  cat(CAT.felleskostnader, 'Felleskostnader', 'bolig', 'expense', 11, '🏢'),
  cat(CAT.strom, 'Strøm og nettleie', 'bolig', 'expense', 12, '⚡'),
  cat(CAT.husleie, 'Husleie', 'bolig', 'expense', 13, '🏠'),
  cat(CAT.forsikring, 'Forsikring', 'bolig', 'expense', 14, '🛡️'),
  cat(CAT.mobler, 'Møbler og interiør', 'hjem', 'expense', 20, '🛋️'),
  cat(CAT.dagligvarer, 'Dagligvarer', 'mat', 'expense', 30, '🛒'),
  cat(CAT.matUte, 'Mat ute', 'mat', 'expense', 31, '🍔'),
  cat(CAT.kantine, 'Kantine', 'mat', 'expense', 32, '🥪'),
  cat(CAT.alkohol, 'Alkohol', 'mat', 'expense', 33, '🍷'),
  cat(CAT.drivstoff, 'Drivstoff', 'transport', 'expense', 40, '⛽'),
  cat(CAT.bil, 'Bil og vedlikehold', 'transport', 'expense', 41, '🚗'),
  cat(CAT.kollektiv, 'Kollektivtransport', 'transport', 'expense', 42, '🚌'),
  cat(CAT.parkering, 'Parkering og bom', 'transport', 'expense', 43, '🅿️'),
  cat(CAT.elektronikk, 'Elektronikk', 'shopping', 'expense', 50, '💻'),
  cat(CAT.klaer, 'Klær og sko', 'shopping', 'expense', 51, '👕'),
  cat(CAT.pleie, 'Pleie og kosmetikk', 'shopping', 'expense', 52, '🧴'),
  cat(CAT.spill, 'Spill og apper', 'fritid', 'expense', 60, '🎮'),
  cat(CAT.hobby, 'Hobby', 'fritid', 'expense', 61, '🎨'),
  cat(CAT.sport, 'Sport og trening', 'fritid', 'expense', 62, '🏃'),
  cat(CAT.kultur, 'Kultur og underholdning', 'fritid', 'expense', 63, '🎭'),
  cat(CAT.reise, 'Reise', 'fritid', 'expense', 64, '✈️'),
  cat(CAT.lotteri, 'Lotteri og pengespill', 'fritid', 'expense', 65, '🎟️'),
  cat(CAT.strommetjenester, 'Strømmetjenester', 'abonnementer', 'expense', 70, '📺'),
  cat(CAT.programvare, 'Programvare og AI', 'abonnementer', 'expense', 71, '🤖'),
  cat(CAT.internett, 'Internett og mobil', 'abonnementer', 'expense', 72, '📱'),
  cat(CAT.helse, 'Helse og apotek', 'helse', 'expense', 80, '💊'),
  cat(CAT.deltHusholdning, 'Delt husholdning', 'annet', 'expense', 90, '🤝'),
  cat(CAT.gaverGitt, 'Gaver gitt', 'annet', 'expense', 91, '🎀'),
  cat(CAT.gebyrer, 'Gebyrer', 'annet', 'expense', 92, '🧾'),
  cat(CAT.kontantuttak, 'Kontantuttak', 'annet', 'expense', 93, '🏧'),
  cat(CAT.revolut, 'Revolut-påfyll', 'annet', 'expense', 94, '💳'),
  cat(CAT.annet, 'Annet', 'annet', 'expense', 95, '📦'),
  cat(CAT.investering, 'Investering', 'sparing', 'saving', 100, '📈'),
  cat(CAT.avdrag, 'Avdrag boliglån', 'sparing', 'saving', 101, '🏡'),
  cat(CAT.boligkjop, 'Boligkjøp og egenkapital', 'sparing', 'saving', 102, '🔨'),
  cat(CAT.intern, 'Intern overføring', 'overforinger', 'transfer', 110, '🔁'),
  cat(CAT.egenAnnenBank, 'Egen konto i annen bank', 'overforinger', 'transfer', 111, '🏦'),
  cat(CAT.uavklart, 'Uavklart', 'uavklart', 'unknown', 120, '❓'),
];

export const DEFAULT_CATEGORY_MAP: Map<string, Category> = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

export function categoryKind(categories: Map<string, Category>, id: string): Kind {
  return categories.get(id)?.kind ?? 'unknown';
}

/** Maps a default category name to its id (used by tests and the import of old backups). */
export function categoryIdByName(name: string): string | null {
  const c = DEFAULT_CATEGORIES.find((x) => x.name === name);
  return c ? c.id : null;
}
