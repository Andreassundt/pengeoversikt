import { PengeDb, SCHEMA_VERSION } from './schema';
import { decryptText, encryptText, isEncryptedEnvelope } from '../core/crypto';
import { nowIso } from '../core/dates';
import type {
  Account,
  Category,
  CategoryGroup,
  FormatProfile,
  ImportRecord,
  MerchantLink,
  Person,
  Rule,
  SettingRow,
  Transaction,
} from '../core/types';

export interface BackupData {
  app: 'pengeoversikt';
  schemaVersion: number;
  exportedAt: string;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  groups: CategoryGroup[];
  rules: Rule[];
  merchantLinks: MerchantLink[];
  persons: Person[];
  formatProfiles: FormatProfile[];
  imports: ImportRecord[];
  settings: SettingRow[];
}

export async function exportBackup(db: PengeDb): Promise<BackupData> {
  const [accounts, transactions, categories, groups, rules, merchantLinks, persons, formatProfiles, imports, settings] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
    db.groups.toArray(),
    db.rules.toArray(),
    db.merchantLinks.toArray(),
    db.persons.toArray(),
    db.formatProfiles.toArray(),
    db.imports.toArray(),
    db.settings.toArray(),
  ]);
  return {
    app: 'pengeoversikt',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    accounts,
    transactions,
    categories,
    groups,
    rules,
    merchantLinks,
    persons,
    formatProfiles,
    imports,
    settings,
  };
}

/** Serialises a backup, optionally encrypted with a password. */
export async function serializeBackup(data: BackupData, password: string | null): Promise<string> {
  const json = JSON.stringify(data);
  if (!password) return json;
  return JSON.stringify(await encryptText(json, password));
}

export class BackupNeedsPassword extends Error {
  constructor() {
    super('Sikkerhetskopien er kryptert. Skriv inn passordet.');
  }
}

/** Parses a backup file; throws BackupNeedsPassword when it is encrypted and no password is given. */
export async function parseBackup(text: string, password: string | null): Promise<BackupData> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Filen er ikke en gyldig sikkerhetskopi.');
  }
  if (isEncryptedEnvelope(value)) {
    if (!password) throw new BackupNeedsPassword();
    value = JSON.parse(await decryptText(value, password));
  }
  const data = value as Partial<BackupData>;
  if (data.app !== 'pengeoversikt' || !Array.isArray(data.transactions) || !Array.isArray(data.accounts)) {
    throw new Error('Filen er ikke en sikkerhetskopi fra Pengeoversikt.');
  }
  if ((data.schemaVersion ?? 0) > SCHEMA_VERSION) {
    throw new Error('Sikkerhetskopien er laget med en nyere versjon av appen. Oppdater appen først.');
  }
  return data as BackupData;
}

/** Replaces everything in the database with the backup, in one transaction. */
export async function restoreBackup(db: PengeDb, data: BackupData): Promise<void> {
  const tables = [db.accounts, db.transactions, db.categories, db.groups, db.rules, db.merchantLinks, db.persons, db.formatProfiles, db.imports, db.settings];
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear();
    await db.accounts.bulkAdd(data.accounts);
    await db.transactions.bulkAdd(data.transactions);
    await db.categories.bulkAdd(data.categories ?? []);
    await db.groups.bulkAdd(data.groups ?? []);
    await db.rules.bulkAdd(data.rules ?? []);
    await db.merchantLinks.bulkAdd(data.merchantLinks ?? []);
    await db.persons.bulkAdd(data.persons ?? []);
    await db.formatProfiles.bulkAdd(data.formatProfiles ?? []);
    await db.imports.bulkAdd(data.imports ?? []);
    await db.settings.bulkAdd(data.settings ?? []);
  });
}

export function backupFileName(encrypted: boolean, now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `pengeoversikt-sikkerhetskopi-${d}${encrypted ? '.kryptert' : ''}.json`;
}
