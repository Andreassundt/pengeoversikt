import type { PengeDb } from './schema';
import type { Account, AccountRole, Category, CategoryGroup } from '../core/types';
import { fold } from '../core/text';

export const SETTING_KEYS = {
  ownerName: 'ownerName',
  oneOffThresholdOre: 'oneOffThresholdOre',
  hideAmounts: 'hideAmounts',
  theme: 'theme',
  lastBackupAt: 'lastBackupAt',
  wizardDone: 'wizardDone',
  hideInternalByDefault: 'hideInternalByDefault',
} as const;

export const DEFAULT_ONE_OFF_THRESHOLD_ORE = 20_000 * 100;

export async function getSetting<T>(db: PengeDb, key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(db: PengeDb, key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function loadCategoryMap(db: PengeDb): Promise<Map<string, Category>> {
  const cats = await db.categories.toArray();
  return new Map(cats.map((c) => [c.id, c]));
}

export async function loadGroupMap(db: PengeDb): Promise<Map<string, CategoryGroup>> {
  const groups = await db.groups.toArray();
  return new Map(groups.map((g) => [g.id, g]));
}

/** Guesses an account role from its name. */
export function guessRole(name: string): AccountRole {
  const n = fold(name);
  if (/BRUKS|LOMMEBOK|DAGLIG/.test(n)) return 'brukskonto';
  if (/LOENN|LONN/.test(n)) return 'lonn';
  if (/BUFFER/.test(n)) return 'buffer';
  if (/SPAR|BSU|FOND/.test(n)) return 'sparing';
  if (/BOLIG|LAAN|HUS/.test(n)) return 'bolig';
  if (/FORSIKRING/.test(n)) return 'forsikring';
  return 'annet';
}

export const ROLE_LABELS: Record<AccountRole, string> = {
  brukskonto: 'Brukskonto',
  lonn: 'Lønn',
  buffer: 'Buffer',
  sparing: 'Sparing',
  bolig: 'Bolig/lån',
  forsikring: 'Forsikring',
  annet: 'Annet',
};

export async function listAccounts(db: PengeDb): Promise<Account[]> {
  return db.accounts.toArray();
}

export async function accountNumbers(db: PengeDb): Promise<Set<string>> {
  return new Set((await db.accounts.toArray()).map((a) => a.number));
}
