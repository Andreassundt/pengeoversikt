import type { PengeDb } from './schema';
import type { Direction, Flag, Person, PersonDefault, Rule, Split, Transaction } from '../core/types';
import { nowIso } from '../core/dates';
import { fold } from '../core/text';

export type CorrectionScope = 'this' | 'all';

/**
 * Changes the category of one transaction. "all" creates a learned merchant link (or a person
 * default for payments to/from a person) and reclassifies; "this" locks the transaction manually.
 */
export async function setCategory(db: PengeDb, txId: number, categoryId: string, scope: CorrectionScope): Promise<void> {
  const tx = await db.transactions.get(txId);
  if (!tx) return;
  if (scope === 'this' || (!tx.merchantKey && tx.personId == null)) {
    await db.transactions.update(txId, { categoryId, manual: true, source: 'manual', confidence: 'høy', splits: null });
    return;
  }
  if (tx.personId != null) {
    const person = await db.persons.get(tx.personId);
    if (person) await setPersonDefault(db, person.id!, { direction: tx.direction, accountId: tx.accountId, categoryId });
    return;
  }
  await db.merchantLinks.put({ merchantKey: tx.merchantKey, categoryId, createdAt: nowIso() });
  // If the transaction was locked earlier, the learned link should win from now on.
  if (tx.manual) await db.transactions.update(txId, { manual: false });
}

export async function setPersonDefault(db: PengeDb, personId: number, def: PersonDefault): Promise<void> {
  const person = await db.persons.get(personId);
  if (!person) return;
  const defaults = person.defaults.filter(
    (d) => !(d.direction === def.direction && (d.accountId ?? null) === (def.accountId ?? null)),
  );
  defaults.push(def);
  await db.persons.update(personId, { defaults });
}

export async function removePersonDefault(db: PengeDb, personId: number, direction: Direction, accountId: number | null): Promise<void> {
  const person = await db.persons.get(personId);
  if (!person) return;
  await db.persons.update(personId, {
    defaults: person.defaults.filter((d) => !(d.direction === direction && (d.accountId ?? null) === accountId)),
  });
}

/** Splits a transaction into several categories. Amounts must add up to the transaction amount. */
export async function setSplits(db: PengeDb, txId: number, splits: Split[] | null): Promise<void> {
  const tx = await db.transactions.get(txId);
  if (!tx) return;
  if (splits && splits.length > 0) {
    const sum = splits.reduce((a, s) => a + s.amountOre, 0);
    if (sum !== tx.amountOre) throw new Error('Splittene må summere til beløpet.');
    const biggest = [...splits].sort((a, b) => Math.abs(b.amountOre) - Math.abs(a.amountOre))[0]!;
    await db.transactions.update(txId, { splits, manual: true, source: 'manual', categoryId: biggest.categoryId });
  } else {
    await db.transactions.update(txId, { splits: null });
  }
}

export async function setOneOff(db: PengeDb, txId: number, on: boolean): Promise<void> {
  await db.transactions.update(txId, { oneOffOverride: on ? 'on' : 'off', oneOffConfirmed: true });
}

export async function confirmOneOff(db: PengeDb, txId: number): Promise<void> {
  await db.transactions.update(txId, { oneOffConfirmed: true });
}

export async function dismissDouble(db: PengeDb, txId: number): Promise<void> {
  const tx = await db.transactions.get(txId);
  if (!tx) return;
  await db.transactions.update(txId, { doubleDismissed: true, flags: tx.flags.filter((f: Flag) => f !== 'possibleDouble') });
}

export async function setNote(db: PengeDb, txId: number, note: string, tags: string[]): Promise<void> {
  await db.transactions.update(txId, { note, tags });
}

export async function unlockManual(db: PengeDb, txId: number): Promise<void> {
  await db.transactions.update(txId, { manual: false });
}

export async function saveRule(db: PengeDb, rule: Rule): Promise<number> {
  return (await db.rules.put(rule)) as number;
}

export async function deleteRule(db: PengeDb, id: number): Promise<void> {
  await db.rules.delete(id);
}

export async function deleteMerchantLink(db: PengeDb, merchantKey: string): Promise<void> {
  await db.merchantLinks.delete(merchantKey);
}

export async function renamePerson(db: PengeDb, personId: number, name: string): Promise<void> {
  await db.persons.update(personId, { displayName: name, role: 'custom-name', nameFolded: fold(name) });
}

/** Splits an account number out of a person into a new person that will not be auto-merged back. */
export async function splitPerson(db: PengeDb, personId: number, accountNumber: string): Promise<void> {
  const person = await db.persons.get(personId);
  if (!person || !person.accountNumbers.includes(accountNumber)) return;
  const txs = await db.transactions.where('personId').equals(personId).toArray();
  const variants = new Map<string, number>();
  for (const t of txs) {
    if (t.counterpartyAccount === accountNumber) variants.set(t.counterpartyName, (variants.get(t.counterpartyName) ?? 0) + 1);
  }
  const names = [...variants.keys()];
  const displayName = names[0] ?? person.displayName;
  const fresh: Person = {
    displayName,
    nameFolded: fold(displayName),
    aliases: names,
    accountNumbers: [accountNumber],
    role: '',
    defaults: [],
    reviewed: true,
    noMerge: names.map(fold),
  };
  await db.persons.add(fresh);
  await db.persons.update(personId, {
    accountNumbers: person.accountNumbers.filter((a) => a !== accountNumber),
    noMerge: [...new Set([...person.noMerge, ...names.map(fold)])],
  });
}

export async function markPersonReviewed(db: PengeDb, personId: number): Promise<void> {
  await db.persons.update(personId, { reviewed: true });
}

export async function acknowledgeImportWarnings(db: PengeDb, importId: number): Promise<void> {
  await db.imports.update(importId, { warningsAcknowledged: true });
}

/** Counts how many transactions a rule would hit (for "test regel"). */
export async function countRuleHits(db: PengeDb, rule: Rule): Promise<number> {
  const { matchRule } = await import('../core/rules');
  let n = 0;
  await db.transactions.each((tx: Transaction) => {
    if (matchRule(rule, tx)) n++;
  });
  return n;
}
