import { RAW, type Person, type Transaction } from './types';
import { fold, looksLikeCompany } from './text';
import { matchDictionary } from './dictionary';

export interface PersonContext {
  ownerFolded: string;
  /** Whether a transaction is handled by a structural rule (transfers, salary, fees…), so it is never a person. */
  isStructural: (tx: Transaction) => boolean;
}

interface Group {
  accountNumbers: Set<string>;
  nameFolds: Set<string>;
  variants: Map<string, number>;
  txs: Transaction[];
}

/** Whether a transaction's counterparty can be a person. */
export function isPersonCandidate(tx: Transaction, ctx: PersonContext): boolean {
  if (tx.isCardPurchase || tx.card) return false;
  if (!tx.counterpartyName || !tx.counterpartyNameFolded) return false;
  if (ctx.isStructural(tx)) return false;
  // The name must come from a real name field or be backed by an account number.
  const named = (tx.raw[RAW.senderName] ?? '') !== '' || (tx.raw[RAW.receiverName] ?? '') !== '';
  if (!named && !tx.counterpartyAccount) return false;
  if (ctx.ownerFolded && tx.counterpartyNameFolded === ctx.ownerFolded) return false;
  if (looksLikeCompany(tx.counterpartyNameFolded)) return false;
  if (matchDictionary(tx.counterpartyNameFolded)) return false;
  return true;
}

/** Most common variant; ties go to the one with mixed case. */
export function pickDisplayName(variants: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [name, count] of variants) {
    const mixed = /[a-zæøå]/.test(name) && /[A-ZÆØÅ]/.test(name);
    const bestMixed = /[a-zæøå]/.test(best) && /[A-ZÆØÅ]/.test(best);
    if (count > bestCount || (count === bestCount && mixed && !bestMixed)) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

export interface PersonSync {
  /** Persons to store (existing ones carry their id). */
  persons: Person[];
  /** For each transaction index in the input, the index into `persons` (or -1). */
  assignment: Int32Array;
}

/**
 * Groups counterparties by account number, merges groups with the same folded name, and matches
 * them to already stored persons. Persons that the user has split are not re-merged (noMerge).
 */
export function syncPersons(txs: Transaction[], existing: Person[], ctx: PersonContext): PersonSync {
  const groups: Group[] = [];
  const byAccount = new Map<string, Group>();
  const byName = new Map<string, Group>();
  const txGroup = new Map<number, Group>();

  const noMerge = new Set<string>();
  for (const p of existing) for (const n of p.noMerge) noMerge.add(n);

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i]!;
    if (!isPersonCandidate(tx, ctx)) continue;
    const nameFold = tx.counterpartyNameFolded;
    const acct = tx.counterpartyAccount;
    let group = (acct && byAccount.get(acct)) || undefined;
    if (!group && !noMerge.has(nameFold)) group = byName.get(nameFold);
    if (!group) {
      group = { accountNumbers: new Set(), nameFolds: new Set(), variants: new Map(), txs: [] };
      groups.push(group);
    }
    if (acct) {
      group.accountNumbers.add(acct);
      byAccount.set(acct, group);
    }
    group.nameFolds.add(nameFold);
    if (!noMerge.has(nameFold)) byName.set(nameFold, group);
    group.variants.set(tx.counterpartyName, (group.variants.get(tx.counterpartyName) ?? 0) + 1);
    group.txs.push(tx);
    txGroup.set(i, group);
  }

  // Merge groups that share an account number or a folded name (union-find over groups).
  const parent = new Map<Group, Group>();
  const find = (g: Group): Group => {
    let r = g;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: Group, b: Group): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const seenAcct = new Map<string, Group>();
  const seenName = new Map<string, Group>();
  for (const g of groups) {
    for (const a of g.accountNumbers) {
      const other = seenAcct.get(a);
      if (other) union(g, other);
      else seenAcct.set(a, g);
    }
    for (const n of g.nameFolds) {
      if (noMerge.has(n)) continue;
      const other = seenName.get(n);
      if (other) union(g, other);
      else seenName.set(n, g);
    }
  }
  const merged = new Map<Group, Group>();
  for (const g of groups) {
    const root = find(g);
    if (!merged.has(root)) merged.set(root, { accountNumbers: new Set(), nameFolds: new Set(), variants: new Map(), txs: [] });
    const target = merged.get(root)!;
    for (const a of g.accountNumbers) target.accountNumbers.add(a);
    for (const n of g.nameFolds) target.nameFolds.add(n);
    for (const [v, c] of g.variants) target.variants.set(v, (target.variants.get(v) ?? 0) + c);
    target.txs.push(...g.txs);
  }

  // Match merged groups to stored persons.
  const existingByAccount = new Map<string, Person>();
  const existingByName = new Map<string, Person>();
  for (const p of existing) {
    for (const a of p.accountNumbers) existingByAccount.set(a, p);
    existingByName.set(p.nameFolded, p);
    for (const alias of p.aliases) existingByName.set(fold(alias), p);
  }

  const persons: Person[] = [];
  const personIndex = new Map<Person, number>();
  const groupPerson = new Map<Group, number>();
  for (const [, g] of merged) {
    let person: Person | undefined;
    for (const a of g.accountNumbers) {
      person = existingByAccount.get(a);
      if (person) break;
    }
    if (!person) {
      for (const n of g.nameFolds) {
        if (noMerge.has(n)) continue;
        person = existingByName.get(n);
        if (person) break;
      }
    }
    const displayName = pickDisplayName(g.variants);
    const aliases = [...g.variants.keys()];
    if (person) {
      const accountNumbers = [...new Set([...person.accountNumbers, ...g.accountNumbers])];
      const mergedAliases = [...new Set([...person.aliases, ...aliases])];
      const updated: Person = {
        ...person,
        accountNumbers,
        aliases: mergedAliases,
        displayName: person.role === 'custom-name' ? person.displayName : displayName || person.displayName,
        nameFolded: person.nameFolded || fold(displayName),
      };
      let idx = personIndex.get(person);
      if (idx == null) {
        idx = persons.length;
        persons.push(updated);
        personIndex.set(person, idx);
      } else {
        persons[idx] = updated;
      }
      groupPerson.set(g, idx);
    } else {
      const fresh: Person = {
        displayName,
        nameFolded: fold(displayName),
        aliases,
        accountNumbers: [...g.accountNumbers],
        role: '',
        defaults: [],
        reviewed: false,
        noMerge: [],
      };
      groupPerson.set(g, persons.length);
      persons.push(fresh);
    }
  }
  // Keep stored persons that had no transactions this time (e.g. after an undo).
  for (const p of existing) if (!personIndex.has(p)) persons.push(p);

  const assignment = new Int32Array(txs.length).fill(-1);
  for (const [i, g] of txGroup) {
    const root = find(g);
    const target = merged.get(root)!;
    const idx = groupPerson.get(target);
    if (idx != null) assignment[i] = idx;
  }
  return { persons, assignment };
}
