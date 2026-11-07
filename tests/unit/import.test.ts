import { beforeEach, describe, expect, it } from 'vitest';
import { PengeDb } from '../../src/db/schema';
import { importFiles, lastBatch, prepareImport, undoImports } from '../../src/db/importer';
import { EXPORT1_FILES, EXPORT2_FILE, readFasit, readFixture } from './helpers';
import { RAW } from '../../src/core/types';
import { dedupeKey } from '../../src/core/dedupe';
import { parseFixture } from './helpers';
import { getSetting, SETTING_KEYS } from '../../src/db/repo';
import path from 'node:path';

let counter = 0;
function freshDb(): PengeDb {
  return new PengeDb(`test-import-${Date.now()}-${counter++}`);
}

const e1 = () => EXPORT1_FILES.map((f) => ({ name: path.basename(f), text: readFixture(f) }));
const e2 = () => [{ name: path.basename(EXPORT2_FILE), text: readFixture(EXPORT2_FILE) }];

async function accountByName(db: PengeDb, name: string) {
  const a = await db.accounts.where('number').equals(name).first();
  if (a) return a;
  const all = await db.accounts.toArray();
  return all.find((x) => x.name === name)!;
}

describe('import (criteria 1–7)', () => {
  let db: PengeDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('1–4: imports eksport-1, recognises five accounts, owner, warnings and balances', async () => {
    const { plan, records } = await importFiles(db, e1());
    expect(plan.errors).toEqual([]);
    expect(records).toHaveLength(5);
    const accounts = await db.accounts.toArray();
    expect(accounts.map((a) => [a.number, a.name]).sort()).toEqual([
      ['1111 22 33001', 'Brukskonto'],
      ['1111 22 33002', 'Lønn'],
      ['1111 22 33003', 'Bolig'],
      ['1111 22 33004', 'Sparing'],
      ['1111 22 33005', 'Forsikringer'],
    ]);
    expect(await getSetting(db, SETTING_KEYS.ownerName, '')).toBe('Ola Fiktiv Testesen');

    const byName = Object.fromEntries(plan.files.map((f) => [f.accountName, f]));
    expect(byName['Sparing']!.warnings).toHaveLength(1);
    expect(byName['Sparing']!.warnings[0]!.replace(/ /g, ' ')).toContain('200,00 kr');
    for (const name of ['Brukskonto', 'Lønn', 'Bolig', 'Forsikringer']) expect(byName[name]!.warnings).toEqual([]);

    const balances = Object.fromEntries(accounts.map((a) => [a.name, a.balanceOre]));
    expect(balances).toEqual({ Brukskonto: 1357635, Lønn: 0, Bolig: 2577333, Sparing: 0, Forsikringer: 1000000 });
    for (const a of accounts) {
      expect(a.balanceDate).toBe('2026-11-07');
      expect(a.lastImportEnd).toBe('2026-11-07');
    }
    const rowCounts = Object.fromEntries(
      await Promise.all(accounts.map(async (a) => [a.name, await db.transactions.where('accountId').equals(a.id!).count()])),
    );
    expect(rowCounts).toEqual({ Brukskonto: 75, Lønn: 5, Bolig: 21, Sparing: 6, Forsikringer: 2 });
    expect(byName['Brukskonto']!.counts).toMatchObject({ rows: 75, newBooked: 73, duplicates: 0, reservedAdded: 2, reservedRemoved: 0 });
  });

  it('5: eksport-2 after eksport-1 gives 38 duplicates, 5 new and 2 reserved replaced', async () => {
    await importFiles(db, e1());
    const { plan, records } = await importFiles(db, e2());
    expect(plan.errors).toEqual([]);
    const file = plan.files[0]!;
    expect(file.counts).toMatchObject({ rows: 43, duplicates: 38, newBooked: 4, reservedAdded: 1, reservedRemoved: 2, reservedSkipped: 0 });
    expect(file.counts.newBooked + file.counts.reservedAdded).toBe(5);
    expect(file.warnings).toEqual([]);

    const bruks = await accountByName(db, 'Brukskonto');
    expect(await db.transactions.where('accountId').equals(bruks.id!).count()).toBe(78);
    expect(bruks.balanceOre).toBe(1297695);
    expect(bruks.balanceDate).toBe('2026-11-10');

    // The inserted rows are exactly those with ny_ved_reimport = ja.
    const inserted = await db.transactions.bulkGet(records[0]!.insertedTxIds);
    const insertedRowNumbers = file.rows.filter((r) => r.tx).map((r) => r.rowNumber).sort((a, b) => a - b);
    const expected = readFasit()
      .filter((r) => r.fil.startsWith('eksport-2') && r.ny_ved_reimport === 'ja')
      .map((r) => r.rad)
      .sort((a, b) => a - b);
    expect(insertedRowNumbers).toEqual(expected);
    expect(inserted).toHaveLength(5);
    const noRows = readFasit().filter((r) => r.fil.startsWith('eksport-2') && r.ny_ved_reimport === 'nei').map((r) => r.rad);
    for (const n of noRows) expect(file.rows.find((r) => r.rowNumber === n)!.action).toBe('duplicate');
  });

  it('6: identical rows are kept exactly twice on both sides', async () => {
    await importFiles(db, e1());
    await importFiles(db, e2());
    const bruks = await accountByName(db, 'Brukskonto');
    const bolig = await accountByName(db, 'Bolig');
    const brukRows = await db.transactions.where('accountId').equals(bruks.id!).toArray();
    const twins = brukRows.filter((t) => t.date === '2026-10-12' && t.description === 'Overføring fra Bolig' && t.amountOre === 300000);
    expect(twins).toHaveLength(2);
    const boligRows = await db.transactions.where('accountId').equals(bolig.id!).toArray();
    const mirror = boligRows.filter((t) => t.date === '2026-10-12' && t.description === 'Overføring til Brukskonto' && t.amountOre === -300000);
    expect(mirror).toHaveLength(2);
  });

  it('7: re-importing eksport-1 right after itself replaces reserved rows with themselves', async () => {
    await importFiles(db, e1());
    const { plan } = await importFiles(db, e1());
    for (const f of plan.files) expect(f.counts.newBooked).toBe(0);
    const bruks = plan.files.find((f) => f.accountName === 'Brukskonto')!;
    expect(bruks.counts).toMatchObject({ duplicates: 73, reservedAdded: 2, reservedRemoved: 2, reservedSkipped: 0 });
    const account = await accountByName(db, 'Brukskonto');
    expect(await db.transactions.where('accountId').equals(account.id!).count()).toBe(75);
    expect(account.balanceOre).toBe(1357635);
    expect(await db.accounts.count()).toBe(5);
  });

  it('7: re-importing eksport-1 after eksport-2 skips the outdated reserved rows', async () => {
    await importFiles(db, e1());
    await importFiles(db, e2());
    const { plan } = await importFiles(db, e1());
    const bruks = plan.files.find((f) => f.accountName === 'Brukskonto')!;
    expect(bruks.counts).toMatchObject({ newBooked: 0, duplicates: 73, reservedAdded: 0, reservedRemoved: 0, reservedSkipped: 2 });
    const account = await accountByName(db, 'Brukskonto');
    expect(await db.transactions.where('accountId').equals(account.id!).count()).toBe(78);
    expect(account.balanceOre).toBe(1297695);
    const reserved = await db.transactions.where('accountId').equals(account.id!).and((t) => t.status === 'reserved').toArray();
    expect(reserved.map((t) => t.description)).toEqual(['KIWI BRYN']);
  });

  it('plans without writing and reports the batch summary', async () => {
    const plan = await prepareImport(db, e1());
    expect(await db.transactions.count()).toBe(0);
    expect(await db.accounts.count()).toBe(0);
    expect(plan.files.every((f) => f.isNewAccount)).toBe(true);
    expect(plan.ownerName).toBe('Ola Fiktiv Testesen');
  });

  it('undoes the last import batch', async () => {
    await importFiles(db, e1());
    await importFiles(db, e2());
    const batch = await lastBatch(db);
    expect(batch).toHaveLength(1);
    await undoImports(db, batch);
    const bruks = await accountByName(db, 'Brukskonto');
    expect(await db.transactions.where('accountId').equals(bruks.id!).count()).toBe(75);
    expect(bruks.balanceOre).toBe(1357635);
    expect(bruks.lastImportEnd).toBe('2026-11-07');
    const reserved = await db.transactions.where('accountId').equals(bruks.id!).and((t) => t.status === 'reserved').toArray();
    expect(reserved.map((t) => t.description).sort()).toEqual(['Battle.net', 'REMA STORGATA']);
    // Undoing the first batch removes everything, including the accounts it created.
    const first = await lastBatch(db);
    expect(first).toHaveLength(5);
    await undoImports(db, first);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.accounts.count()).toBe(0);
  });

  it('keeps raw fields and a stable dedupe key', async () => {
    await importFiles(db, e1());
    const bruks = await accountByName(db, 'Brukskonto');
    const parsed = parseFixture(EXPORT1_FILES[0]!);
    const first = parsed.rows[0]!;
    const tx = await db.transactions.where('dedupeKey').equals(dedupeKey('1111 22 33001', first.fields)).first();
    expect(tx).toBeDefined();
    expect(tx!.accountId).toBe(bruks.id);
    expect(tx!.raw[RAW.description]).toBe('Overføring fra Bolig');
    expect(tx!.categoryId).toBe('intern');
  });

  it('reports unknown formats as errors without touching the database', async () => {
    const { plan } = await importFiles(db, [{ name: 'rar.csv', text: 'Dato;Beløp\n01.01.2026;-10\n' }]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]!.reason).toBe('unknown-format');
    expect(await db.accounts.count()).toBe(0);
  });
});
