import Dexie, { type EntityTable } from 'dexie';
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
import { DEFAULT_CATEGORIES, DEFAULT_GROUPS } from '../core/categories';

export const SCHEMA_VERSION = 1;
export const DB_NAME = 'pengeoversikt';

export class PengeDb extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  groups!: EntityTable<CategoryGroup, 'id'>;
  rules!: EntityTable<Rule, 'id'>;
  merchantLinks!: EntityTable<MerchantLink, 'merchantKey'>;
  persons!: EntityTable<Person, 'id'>;
  formatProfiles!: EntityTable<FormatProfile, 'signature'>;
  imports!: EntityTable<ImportRecord, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      accounts: '++id, &number',
      transactions:
        '++id, accountId, statDate, [accountId+statDate], categoryId, merchantKey, dedupeKey, importId, status, date, personId, recurringKey, linkedTxId',
      categories: 'id, groupId, order',
      groups: 'id, order',
      rules: '++id, priority',
      merchantLinks: 'merchantKey',
      persons: '++id, nameFolded, *accountNumbers',
      formatProfiles: 'signature',
      imports: '++id, accountId, importedAt, batchId',
      settings: 'key',
    });
    this.on('populate', () => {
      void this.groups.bulkAdd(DEFAULT_GROUPS);
      void this.categories.bulkAdd(DEFAULT_CATEGORIES);
    });
  }
}

let shared: PengeDb | null = null;

/** The app-wide database instance (lazy). Tests create their own with `new PengeDb(name)`. */
export function getDb(): PengeDb {
  if (!shared) shared = new PengeDb();
  return shared;
}

/** Ensures default groups/categories exist (for databases created before a category was added). */
export async function ensureDefaults(db: PengeDb): Promise<void> {
  const count = await db.categories.count();
  if (count === 0) {
    await db.groups.bulkPut(DEFAULT_GROUPS);
    await db.categories.bulkPut(DEFAULT_CATEGORIES);
    return;
  }
  const existing = new Set((await db.categories.toCollection().primaryKeys()) as string[]);
  const missing = DEFAULT_CATEGORIES.filter((c) => !existing.has(c.id));
  if (missing.length > 0) await db.categories.bulkPut(missing);
  const groups = new Set((await db.groups.toCollection().primaryKeys()) as string[]);
  const missingGroups = DEFAULT_GROUPS.filter((g) => !groups.has(g.id));
  if (missingGroups.length > 0) await db.groups.bulkPut(missingGroups);
}
