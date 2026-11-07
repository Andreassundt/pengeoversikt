import type { PengeDb } from './schema';
import type { Person, RecurringGroup, Transaction } from '../core/types';
import { classify, classifyStructural } from '../core/classify';
import { syncPersons } from '../core/persons';
import { postProcess, type PostContext } from '../core/postprocess';
import { buildClassifyContext } from './importer';
import { DEFAULT_ONE_OFF_THRESHOLD_ORE, getSetting, SETTING_KEYS } from './repo';
import { todayIso } from '../core/dates';
import { fold } from '../core/text';

export interface ReclassifyResult {
  /** Transactions whose category changed. */
  changed: number;
  /** Transactions written (any field changed). */
  written: number;
  groups: RecurringGroup[];
  total: number;
}

const COMPARE_FIELDS: Array<keyof Transaction> = [
  'categoryId',
  'kind',
  'source',
  'confidence',
  'displayName',
  'canonicalName',
  'splits',
  'flags',
  'fastHint',
  'linkedTxId',
  'pairTxId',
  'recurringKey',
  'personId',
];

function snapshot(tx: Transaction): string {
  return JSON.stringify(COMPARE_FIELDS.map((f) => tx[f]));
}

/**
 * Reclassifies all non-manual transactions, syncs persons and runs post-processing.
 * Called after every import and whenever rules, links, categories or settings change.
 */
export async function reclassifyAll(db: PengeDb, today: string = todayIso()): Promise<ReclassifyResult> {
  const txs = await db.transactions.toArray();
  const accounts = await db.accounts.toArray();
  const accountNumberById = new Map<number, string>(accounts.map((a) => [a.id!, a.number]));
  const before = new Map<number, string>();
  const beforeCategory = new Map<number, string>();
  for (const tx of txs) {
    before.set(tx.id!, snapshot(tx));
    beforeCategory.set(tx.id!, tx.categoryId);
  }

  const ctx = await buildClassifyContext(db);
  const ownerFolded = ctx.ownerFolded;

  // 1. Persons (structural transfer check only, so this does not depend on the full classification).
  const existingPersons = await db.persons.toArray();
  const sync = syncPersons(txs, existingPersons, {
    ownerFolded,
    isStructural: (tx) => {
      if (tx.manual && tx.kind === 'transfer') return true;
      return classifyStructural({ ...tx, accountNumber: accountNumberById.get(tx.accountId) ?? '' }, ctx) != null;
    },
  });
  const personIds = (await db.persons.bulkPut(sync.persons, { allKeys: true })) as number[];
  const personsById = new Map<number, Person>();
  sync.persons.forEach((p, i) => {
    p.id = personIds[i]!;
    personsById.set(p.id, p);
  });
  for (let i = 0; i < txs.length; i++) {
    const idx = sync.assignment[i]!;
    txs[i]!.personId = idx >= 0 ? personIds[idx]! : null;
  }
  // Stored persons may have gained accounts/aliases: rebuild the lookup for person defaults.
  const byAccount = new Map<string, Person>();
  const byName = new Map<string, Person>();
  for (const p of sync.persons) {
    for (const acc of p.accountNumbers) byAccount.set(acc, p);
    byName.set(p.nameFolded, p);
    for (const alias of p.aliases) byName.set(fold(alias), p);
  }
  ctx.findPerson = (acct, nameFolded) => (acct && byAccount.get(acct)) || (nameFolded && byName.get(nameFolded)) || null;

  // 2. Classification of non-manual transactions.
  for (const tx of txs) {
    if (tx.manual) continue;
    const cls = classify({ ...tx, accountNumber: accountNumberById.get(tx.accountId) ?? '' }, ctx);
    tx.categoryId = cls.categoryId;
    tx.kind = cls.kind;
    tx.source = cls.source;
    tx.confidence = cls.confidence;
    tx.canonicalName = cls.displayName;
    tx.splits = cls.splits;
    tx.fastHint = cls.fastHint;
  }

  // 3. Post-processing.
  const postCtx: PostContext = {
    categories: ctx.categories,
    accountNumberById,
    personsById,
    oneOffThresholdOre: await getSetting<number>(db, SETTING_KEYS.oneOffThresholdOre, DEFAULT_ONE_OFF_THRESHOLD_ORE),
    today,
  };
  const groups = postProcess(txs, postCtx);

  // 4. Write only what changed.
  const toWrite: Transaction[] = [];
  let changed = 0;
  for (const tx of txs) {
    if (snapshot(tx) !== before.get(tx.id!)) toWrite.push(tx);
    if (tx.categoryId !== beforeCategory.get(tx.id!)) changed++;
  }
  if (toWrite.length > 0) await db.transactions.bulkPut(toWrite);
  return { changed, written: toWrite.length, groups, total: txs.length };
}

/** Recomputes recurring groups without writing (for the Faste screen). */
export async function computeRecurringGroups(db: PengeDb, today: string = todayIso()): Promise<RecurringGroup[]> {
  const result = await reclassifyAll(db, today);
  return result.groups;
}
