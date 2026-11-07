import type { PengeDb } from './schema';
import type { Account, ImportRecord, ParsedFile, Person, Transaction } from '../core/types';
import { RAW } from '../core/types';
import { parseFileText } from '../core/parse';
import { collectAccountNames, detectAccountNumber, detectOwner } from '../core/accounts';
import { normalizeRow } from '../core/normalize';
import { dedupeKey } from '../core/dedupe';
import { validateAgainstFooter } from '../core/validate';
import { classify, type ClassifyContext, type ClassifyResult } from '../core/classify';
import { fold } from '../core/text';
import { nowIso } from '../core/dates';
import { CAT } from '../core/categories';
import { guessRole, getSetting, loadCategoryMap, setSetting, SETTING_KEYS } from './repo';

export interface ImportInput {
  name: string;
  text: string;
  /** Account number chosen by the user when the file itself does not reveal it. */
  accountNumber?: string;
}

export type PlannedAction = 'insert' | 'duplicate' | 'reserved-insert' | 'reserved-skip';

export interface PlannedRow {
  rowNumber: number;
  action: PlannedAction;
  tx: Transaction | null;
}

export interface FilePlan {
  fileName: string;
  parsed: ParsedFile;
  accountNumber: string;
  accountName: string;
  accountId: number | null;
  isNewAccount: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  closingBalanceOre: number | null;
  rows: PlannedRow[];
  reservedToRemove: Transaction[];
  counts: {
    rows: number;
    newBooked: number;
    duplicates: number;
    reservedAdded: number;
    reservedRemoved: number;
    reservedSkipped: number;
    needsReview: number;
  };
  warnings: string[];
}

export interface ImportError {
  fileName: string;
  reason: 'empty' | 'unknown-format' | 'no-account' | 'error';
  message: string;
  header?: string[];
  sample?: string[][];
}

export interface ImportPlan {
  batchId: string;
  files: FilePlan[];
  errors: ImportError[];
  ownerName: string | null;
}

interface AccountState {
  account: Account | null;
  number: string;
  name: string;
  /** Running dedupe counts of booked rows (DB + planned inserts earlier in this batch). */
  bookedCounts: Map<string, number>;
  /** Reserved rows currently stored (minus those already planned for removal in this batch). */
  reserved: Transaction[];
  lastImportEnd: string | null;
}

export function fileEndDate(parsed: ParsedFile): string | null {
  if (parsed.footer?.periodEnd) return parsed.footer.periodEnd;
  let max: string | null = null;
  for (const row of parsed.rows) {
    const n = normalizeRow(row.fields);
    if (!max || n.date > max) max = n.date;
  }
  return max;
}

export function fileStartDate(parsed: ParsedFile): string | null {
  if (parsed.footer?.periodStart) return parsed.footer.periodStart;
  let min: string | null = null;
  for (const row of parsed.rows) {
    const n = normalizeRow(row.fields);
    if (!min || n.date < min) min = n.date;
  }
  return min;
}

function newBatchId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildTransaction(
  fields: string[],
  accountNumber: string,
  accountId: number,
  importId: number,
  cls: ClassifyResult,
): Transaction {
  const n = normalizeRow(fields);
  return {
    ...n,
    accountId,
    importId,
    raw: fields,
    dedupeKey: dedupeKey(accountNumber, fields),
    canonicalName: cls.displayName,
    displayName: cls.displayName ?? n.merchantName ?? '',
    categoryId: cls.categoryId,
    kind: cls.kind,
    source: cls.source,
    confidence: cls.confidence,
    manual: false,
    splits: cls.splits,
    flags: cls.confidence === 'lav' && cls.categoryId !== CAT.uavklart ? ['lowConfidence'] : [],
    fastHint: cls.fastHint,
    linkedTxId: null,
    pairTxId: null,
    recurringKey: null,
    personId: null,
    oneOffOverride: null,
    oneOffConfirmed: false,
    doubleDismissed: false,
    note: '',
    tags: [],
  };
}

/** Builds the classification context from the database plus the accounts in the current batch. */
export async function buildClassifyContext(db: PengeDb, extraAccountNumbers: Iterable<string> = []): Promise<ClassifyContext> {
  const [accounts, categories, rules, links, persons, ownerName] = await Promise.all([
    db.accounts.toArray(),
    loadCategoryMap(db),
    db.rules.orderBy('priority').toArray(),
    db.merchantLinks.toArray(),
    db.persons.toArray(),
    getSetting<string>(db, SETTING_KEYS.ownerName, ''),
  ]);
  const myAccountNumbers = new Set(accounts.map((a) => a.number));
  for (const n of extraAccountNumbers) myAccountNumbers.add(n);
  const byAccount = new Map<string, Person>();
  const byName = new Map<string, Person>();
  for (const p of persons) {
    for (const acc of p.accountNumbers) byAccount.set(acc, p);
    byName.set(p.nameFolded, p);
  }
  return {
    myAccountNumbers,
    ownerFolded: fold(ownerName),
    categories,
    rules: rules.filter((r) => r.enabled),
    links: new Map(links.map((l) => [l.merchantKey, l])),
    findPerson: (acct, nameFolded) => (acct && byAccount.get(acct)) || (nameFolded && byName.get(nameFolded)) || null,
  };
}

/**
 * Parses files, detects accounts, dedupes against the database and classifies new rows.
 * Nothing is written. The plan is shown to the user before `commitImport`.
 */
export async function prepareImport(db: PengeDb, inputs: ImportInput[]): Promise<ImportPlan> {
  const profiles = await db.formatProfiles.toArray();
  const errors: ImportError[] = [];
  const parsedFiles: Array<{ input: ImportInput; parsed: ParsedFile }> = [];
  for (const input of inputs) {
    const res = parseFileText(input.text, input.name, profiles);
    if (!res.ok) {
      errors.push({ fileName: input.name, reason: res.reason, message: res.message, header: res.header, sample: res.sample });
      continue;
    }
    parsedFiles.push({ input, parsed: res.file });
  }

  // Account names and owner from all files in the batch plus what is already stored.
  const existingAccounts = await db.accounts.toArray();
  const names = new Map<string, string>();
  for (const { parsed } of parsedFiles) collectAccountNames(parsed.rows, names);
  for (const a of existingAccounts) if (!names.has(a.number)) names.set(a.number, a.name);
  let ownerName = await getSetting<string | null>(db, SETTING_KEYS.ownerName, null);
  if (!ownerName) {
    const owner = detectOwner(parsedFiles.flatMap((p) => p.parsed.rows));
    ownerName = owner.name;
  }

  // Resolve the account of each file first so the classification context knows every own account.
  const resolved: Array<{ input: ImportInput; parsed: ParsedFile; number: string; detectionWarning: string | null }> = [];
  for (const { input, parsed } of parsedFiles) {
    const detection = detectAccountNumber(parsed.rows);
    const number = input.accountNumber ?? detection.number;
    if (!number) {
      errors.push({
        fileName: input.name,
        reason: 'no-account',
        message: 'Fant ikke hvilken konto filen gjelder. Velg konto manuelt.',
        header: parsed.header,
      });
      continue;
    }
    resolved.push({ input, parsed, number, detectionWarning: input.accountNumber ? null : detection.warning });
  }

  const ctx = await buildClassifyContext(
    db,
    resolved.map((r) => r.number),
  );
  if (ownerName) ctx.ownerFolded = fold(ownerName);

  const states = new Map<string, AccountState>();
  const stateFor = async (number: string): Promise<AccountState> => {
    const existing = states.get(number);
    if (existing) return existing;
    const account = existingAccounts.find((a) => a.number === number) ?? null;
    const bookedCounts = new Map<string, number>();
    let reserved: Transaction[] = [];
    if (account?.id != null) {
      const txs = await db.transactions.where('accountId').equals(account.id).toArray();
      for (const t of txs) {
        if (t.status === 'booked') bookedCounts.set(t.dedupeKey, (bookedCounts.get(t.dedupeKey) ?? 0) + 1);
        else reserved.push(t);
      }
    }
    const state: AccountState = {
      account,
      number,
      name: names.get(number) ?? account?.name ?? number,
      bookedCounts,
      reserved,
      lastImportEnd: account?.lastImportEnd ?? null,
    };
    states.set(number, state);
    return state;
  };

  const files: FilePlan[] = [];
  for (const { parsed, number, detectionWarning } of resolved) {
    const state = await stateFor(number);
    const periodStart = fileStartDate(parsed);
    const periodEnd = fileEndDate(parsed);
    const warnings: string[] = [...parsed.warnings];
    if (detectionWarning) warnings.push(detectionWarning);
    const validation = validateAgainstFooter(parsed.rows, parsed.footer);
    warnings.push(...validation.warnings);

    const isNewerOrEqual = !state.lastImportEnd || (periodEnd != null && periodEnd >= state.lastImportEnd);
    const reservedToRemove: Transaction[] = [];
    if (isNewerOrEqual) {
      for (const t of state.reserved) {
        const inPeriod = (!periodStart || t.date >= periodStart) && (!periodEnd || t.date <= periodEnd);
        if (inPeriod) reservedToRemove.push(t);
      }
      state.reserved = state.reserved.filter((t) => !reservedToRemove.includes(t));
    }

    // Count occurrences per key in the file, then decide per row.
    const fileCounts = new Map<string, number>();
    for (const row of parsed.rows) {
      if (fold(row.fields[RAW.status] ?? '') === 'RESERVERT') continue;
      const key = dedupeKey(number, row.fields);
      fileCounts.set(key, (fileCounts.get(key) ?? 0) + 1);
    }
    const toInsertPerKey = new Map<string, number>();
    for (const [key, n] of fileCounts) {
      const m = state.bookedCounts.get(key) ?? 0;
      toInsertPerKey.set(key, Math.max(0, n - m));
    }

    const rows: PlannedRow[] = [];
    const counts = { rows: parsed.rows.length, newBooked: 0, duplicates: 0, reservedAdded: 0, reservedRemoved: reservedToRemove.length, reservedSkipped: 0, needsReview: 0 };
    const accountId = state.account?.id ?? -1;
    for (const row of parsed.rows) {
      const isReserved = fold(row.fields[RAW.status] ?? '') === 'RESERVERT';
      if (isReserved) {
        if (!isNewerOrEqual) {
          counts.reservedSkipped++;
          rows.push({ rowNumber: row.rowNumber, action: 'reserved-skip', tx: null });
          continue;
        }
        const cls = classify({ ...normalizeRow(row.fields), accountNumber: number, accountId: state.account?.id }, ctx);
        const tx = buildTransaction(row.fields, number, accountId, -1, cls);
        if (needsReview(tx)) counts.needsReview++;
        counts.reservedAdded++;
        rows.push({ rowNumber: row.rowNumber, action: 'reserved-insert', tx });
        state.reserved.push(tx);
        continue;
      }
      const key = dedupeKey(number, row.fields);
      const remaining = toInsertPerKey.get(key) ?? 0;
      if (remaining > 0) {
        toInsertPerKey.set(key, remaining - 1);
        state.bookedCounts.set(key, (state.bookedCounts.get(key) ?? 0) + 1);
        const cls = classify({ ...normalizeRow(row.fields), accountNumber: number, accountId: state.account?.id }, ctx);
        const tx = buildTransaction(row.fields, number, accountId, -1, cls);
        if (cls.warnings.length > 0) warnings.push(`Rad ${row.rowNumber}: ${cls.warnings.join(' ')}`);
        if (needsReview(tx)) counts.needsReview++;
        counts.newBooked++;
        rows.push({ rowNumber: row.rowNumber, action: 'insert', tx });
      } else {
        counts.duplicates++;
        rows.push({ rowNumber: row.rowNumber, action: 'duplicate', tx: null });
      }
    }
    if (periodEnd && (!state.lastImportEnd || periodEnd > state.lastImportEnd)) state.lastImportEnd = periodEnd;

    files.push({
      fileName: parsed.fileName,
      parsed,
      accountNumber: number,
      accountName: state.name,
      accountId: state.account?.id ?? null,
      isNewAccount: !state.account,
      periodStart,
      periodEnd,
      closingBalanceOre: parsed.footer?.closingBalanceOre ?? null,
      rows,
      reservedToRemove,
      counts,
      warnings,
    });
  }

  return { batchId: newBatchId(), files, errors, ownerName };
}

export function needsReview(tx: Transaction): boolean {
  return tx.categoryId === CAT.uavklart || tx.confidence === 'lav';
}

/** Writes a plan to the database in one transaction. Returns the import records. */
export async function commitImport(db: PengeDb, plan: ImportPlan): Promise<ImportRecord[]> {
  const importedAt = nowIso();
  const records: ImportRecord[] = [];
  await db.transaction('rw', [db.accounts, db.transactions, db.imports, db.settings], async () => {
    if (plan.ownerName) {
      const existing = await db.settings.get(SETTING_KEYS.ownerName);
      if (!existing || !existing.value) await setSetting(db, SETTING_KEYS.ownerName, plan.ownerName);
    }
    for (const file of plan.files) {
      let account = await db.accounts.where('number').equals(file.accountNumber).first();
      let accountCreated = false;
      let previousAccount: ImportRecord['previousAccount'] = null;
      if (!account) {
        const fresh: Account = {
          number: file.accountNumber,
          name: file.accountName,
          role: guessRole(file.accountName),
          balanceOre: 0,
          balanceDate: null,
          lastImportEnd: null,
          lastImportAt: null,
          hidden: false,
        };
        const id = await db.accounts.add(fresh);
        account = { ...fresh, id };
        accountCreated = true;
      } else {
        previousAccount = {
          balanceOre: account.balanceOre,
          balanceDate: account.balanceDate,
          lastImportEnd: account.lastImportEnd,
          lastImportAt: account.lastImportAt,
        };
        // A name learned from a later file (own transfers) is better than the bare number.
        if (account.name === account.number && file.accountName !== file.accountNumber) account.name = file.accountName;
      }
      const accountId = account.id!;

      const record: ImportRecord = {
        batchId: plan.batchId,
        fileName: file.fileName,
        accountId,
        accountNumber: file.accountNumber,
        periodStart: file.periodStart,
        periodEnd: file.periodEnd,
        importedAt,
        rowCount: file.counts.rows,
        newBooked: file.counts.newBooked,
        duplicates: file.counts.duplicates,
        reservedAdded: file.counts.reservedAdded,
        reservedRemoved: file.counts.reservedRemoved,
        reservedSkipped: file.counts.reservedSkipped,
        warnings: file.warnings,
        warningsAcknowledged: file.warnings.length === 0,
        needsReview: file.counts.needsReview,
        insertedTxIds: [],
        removedReserved: file.reservedToRemove,
        previousAccount,
        accountCreated,
        undone: false,
      };
      const importId = (await db.imports.add(record)) as number;

      const removeIds = file.reservedToRemove.map((t) => t.id!).filter((id) => id != null);
      if (removeIds.length > 0) await db.transactions.bulkDelete(removeIds);

      const toInsert = file.rows
        .filter((r) => r.tx)
        .map((r) => ({ ...r.tx!, accountId, importId }));
      const ids = toInsert.length > 0 ? ((await db.transactions.bulkAdd(toInsert, { allKeys: true })) as number[]) : [];
      await db.imports.update(importId, { insertedTxIds: ids });

      const updates: Partial<Account> = { lastImportAt: importedAt };
      if (file.periodEnd && (!account.lastImportEnd || file.periodEnd > account.lastImportEnd)) updates.lastImportEnd = file.periodEnd;
      if (file.closingBalanceOre != null && file.periodEnd && (!account.balanceDate || file.periodEnd >= account.balanceDate)) {
        updates.balanceOre = file.closingBalanceOre;
        updates.balanceDate = file.periodEnd;
      }
      if (account.name !== (await db.accounts.get(accountId))?.name) updates.name = account.name;
      await db.accounts.update(accountId, updates);
      records.push({ ...record, id: importId, insertedTxIds: ids });
    }
  });
  return records;
}

/** Parses, plans and commits in one go (used by tests and the share-target flow). */
export async function importFiles(db: PengeDb, inputs: ImportInput[]): Promise<{ plan: ImportPlan; records: ImportRecord[] }> {
  const plan = await prepareImport(db, inputs);
  const records = await commitImport(db, plan);
  return { plan, records };
}

/** The most recent import batch (all files imported together). */
export async function lastBatch(db: PengeDb): Promise<ImportRecord[]> {
  const all = await db.imports.orderBy('importedAt').reverse().toArray();
  const latest = all.find((r) => !r.undone);
  if (!latest) return [];
  return all.filter((r) => !r.undone && r.batchId === latest.batchId);
}

/** Undoes an import batch: removes inserted rows, restores replaced reserved rows and account state. */
export async function undoImports(db: PengeDb, records: ImportRecord[]): Promise<void> {
  await db.transaction('rw', [db.accounts, db.transactions, db.imports], async () => {
    // Undo in reverse order so account state is restored to what it was before the first file.
    for (const record of [...records].reverse()) {
      if (record.id == null || record.undone) continue;
      await db.transactions.bulkDelete(record.insertedTxIds);
      if (record.removedReserved.length > 0) {
        const stillPresent = new Set(
          (await db.transactions.bulkGet(record.removedReserved.map((t) => t.id!))).filter(Boolean).map((t) => t!.id),
        );
        const restore = record.removedReserved.filter((t) => !stillPresent.has(t.id));
        if (restore.length > 0) await db.transactions.bulkAdd(restore);
      }
      const account = await db.accounts.get(record.accountId);
      if (account) {
        const remaining = await db.transactions.where('accountId').equals(record.accountId).count();
        if (record.accountCreated && remaining === 0) {
          await db.accounts.delete(record.accountId);
        } else if (record.previousAccount) {
          await db.accounts.update(record.accountId, record.previousAccount);
        }
      }
      await db.imports.update(record.id, { undone: true });
    }
  });
}
