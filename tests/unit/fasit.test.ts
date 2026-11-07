import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { PengeDb } from '../../src/db/schema';
import { importFiles } from '../../src/db/importer';
import { reclassifyAll } from '../../src/db/reclassify';
import { EXPORT1_FILES, EXPORT2_FILE, parseFixture, readFasit, readFixture, type FasitRow } from './helpers';
import { dedupeKey } from '../../src/core/dedupe';
import { CAT, DEFAULT_CATEGORIES } from '../../src/core/categories';
import type { Flag, Transaction } from '../../src/core/types';
import { setCategory, setPersonDefault } from '../../src/db/actions';

const TODAY = '2026-11-10';
const FLAG_NAMES: Record<Flag, string> = {
  recurring: 'abonnement',
  possibleDouble: 'mulig_dobbelttrekk',
  refunded: 'refundert',
  refund: 'refusjon',
  oneOff: 'engangs',
  lowConfidence: 'lav_sikkerhet',
};
const NAME_BY_ID = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));

let counter = 0;
const freshDb = () => new PengeDb(`test-fasit-${Date.now()}-${counter++}`);
const inputs = (files: string[]) => files.map((f) => ({ name: path.basename(f), text: readFixture(f) }));

function flagNames(tx: Transaction): string[] {
  const names = tx.flags.map((f) => FLAG_NAMES[f]);
  if (tx.status === 'reserved') names.push('reservert');
  return names.sort();
}

async function txIndex(db: PengeDb): Promise<Map<string, Transaction>> {
  const map = new Map<string, Transaction>();
  for (const tx of await db.transactions.toArray()) if (!map.has(tx.dedupeKey)) map.set(tx.dedupeKey, tx);
  return map;
}

const ACCOUNT_OF_FILE: Record<string, string> = {
  'Transaksjonsliste-07-11-25-07-11-26.csv': '1111 22 33001',
  'Transaksjonsliste-07-11-25-07-11-26_1.csv': '1111 22 33002',
  'Transaksjonsliste-07-11-25-07-11-26_2.csv': '1111 22 33003',
  'Transaksjonsliste-07-11-25-07-11-26_3.csv': '1111 22 33004',
  'Transaksjonsliste-07-11-25-07-11-26_4.csv': '1111 22 33005',
  'Transaksjonsliste-12-10-26-10-11-26.csv': '1111 22 33001',
};

function findTx(index: Map<string, Transaction>, row: FasitRow): Transaction {
  const parsed = parseFixture(row.fil);
  const raw = parsed.rows[row.rad - 1]!;
  const key = dedupeKey(ACCOUNT_OF_FILE[path.basename(row.fil)]!, raw.fields);
  const tx = index.get(key);
  if (!tx) throw new Error(`Fant ikke ${row.fil} rad ${row.rad}`);
  return tx;
}

function checkRow(tx: Transaction, row: FasitRow, expectedCategory: string): void {
  const label = `${path.basename(row.fil)} rad ${row.rad} (${row.beskrivelse})`;
  if (expectedCategory.startsWith('SPLITT:')) {
    expect(tx.splits, label).toEqual([
      { categoryId: CAT.avdrag, amountOre: -497200 },
      { categoryId: CAT.renter, amountOre: -846700 },
      { categoryId: CAT.gebyrer, amountOre: -7000 },
    ]);
  } else {
    expect(NAME_BY_ID.get(tx.categoryId), label).toBe(expectedCategory);
  }
  expect(flagNames(tx), label).toEqual([...row.flagg].sort());
  if (row.navn) expect(tx.displayName, label).toBe(row.navn);
}

async function applyTestSetup(db: PengeDb): Promise<void> {
  const persons = await db.persons.toArray();
  const mia = persons.find((p) => p.nameFolded === 'MIA LEIETAKER HANSEN')!;
  expect(mia).toBeDefined();
  expect(mia.accountNumbers.sort()).toEqual(['2222 33 44001', '2222 33 44002']);
  expect(mia.aliases).toContain('Mia L Hansen');
  const accounts = await db.accounts.toArray();
  const bolig = accounts.find((a) => a.name === 'Bolig')!;
  const bruks = accounts.find((a) => a.name === 'Brukskonto')!;
  await setPersonDefault(db, mia.id!, { direction: 'in', accountId: bolig.id!, categoryId: CAT.leieinntekt });
  await setPersonDefault(db, mia.id!, { direction: 'in', accountId: bruks.id!, categoryId: CAT.deltHusholdning });
  await setPersonDefault(db, mia.id!, { direction: 'out', accountId: null, categoryId: CAT.deltHusholdning });
  await reclassifyAll(db, TODAY);
}

describe('fasit: eksport-1 (criteria 8–11)', () => {
  let db: PengeDb;
  const fasit = readFasit().filter((r) => r.fil.startsWith('eksport-1'));

  beforeAll(async () => {
    db = freshDb();
    await importFiles(db, inputs(EXPORT1_FILES));
    await reclassifyAll(db, TODAY);
  });

  it('classifies every row as expected without the setup (uten_oppsett)', async () => {
    const index = await txIndex(db);
    for (const row of fasit) checkRow(findTx(index, row), row, row.uten_oppsett);
  });

  it('classifies every row as expected after the setup (kategori)', async () => {
    await applyTestSetup(db);
    const index = await txIndex(db);
    for (const row of fasit) checkRow(findTx(index, row), row, row.kategori);
  });

  it('10: links refunds and nets them to zero', async () => {
    const txs = await db.transactions.toArray();
    const steamBuy = txs.find((t) => t.description === 'PAYPAL *STEAM GAMES' && t.amountOre === -39000)!;
    const steamRefund = txs.find((t) => t.subtype === 'Kreditoverføring' && t.amountOre === 39000)!;
    expect(steamBuy.linkedTxId).toBe(steamRefund.id);
    expect(steamRefund.linkedTxId).toBe(steamBuy.id);
    expect(steamRefund.categoryId).toBe(CAT.spill);
    expect(steamBuy.statDate).toBe('2026-08-28');
    expect(steamRefund.statDate).toBe('2026-09-05');
    const mfBuy = txs.find((t) => t.description === 'PAYPAL *GOOGLE MACROFACTO')!;
    const mfRefund = txs.find((t) => t.subtype === 'Kreditoverføring' && t.amountOre === 89900)!;
    expect(mfBuy.linkedTxId).toBe(mfRefund.id);
    expect(mfRefund.categoryId).toBe(CAT.programvare);
    expect(steamBuy.amountOre + steamRefund.amountOre).toBe(0);
    expect(mfBuy.amountOre + mfRefund.amountOre).toBe(0);
  });

  it('11: recognises the fixed charges and nothing else', async () => {
    const { groups } = await reclassifyAll(db, TODAY);
    const byName = new Map(groups.map((g) => [g.name, g]));
    expect(byName.get('YouTube Premium')).toMatchObject({ amountOre: 26900, interval: 'monthly', count: 3 });
    expect(byName.get('Prime Video')).toMatchObject({ amountOre: 7900, interval: 'monthly', count: 3 });
    expect(byName.get('Ad free for')).toMatchObject({ amountOre: 2900, interval: 'monthly', count: 3 });
    expect(byName.get('ChatGPT')).toMatchObject({ currency: 'USD', amountMinor: 2500, interval: 'monthly', count: 2 });
    expect(byName.get('Claude')).toMatchObject({ possibleDouble: true, count: 2 });
    expect(byName.get('Lyse Tele')).toMatchObject({ amountOre: 53969, interval: 'monthly', count: 2 });
    expect(byName.get('Fremtind')).toMatchObject({ amountOre: 78534, count: 1, isNew: true });
    expect(byName.get('Norsk Tipping')).toMatchObject({ amountOre: 7500, count: 1 });
    for (const name of ['Steam', 'Elkjøp', 'Rema 1000', 'Apotek 1', 'Circle K', 'Nordnet', 'Mia Leietaker Hansen']) {
      expect(byName.has(name), name).toBe(false);
    }
  });

  it('9: shows original currency for foreign purchases', async () => {
    const okq8 = (await db.transactions.toArray()).find((t) => t.description === 'OKQ8')!;
    expect(okq8.card).toMatchObject({ currency: 'SEK', amountMinor: 53523, rate: '0.9836' });
    expect(okq8.amountOre).toBe(-52647);
    expect(okq8.displayName).toBe('OKQ8');
  });

  it('pairs both sides of internal transfers for display only', async () => {
    const txs = await db.transactions.toArray();
    const out = txs.find((t) => t.description === 'Overføring til Forsikringer' && t.amountOre === -900000)!;
    const inn = txs.find((t) => t.description === 'Overføring fra Bolig' && t.amountOre === 900000)!;
    expect(out.pairTxId).toBe(inn.id);
    expect(inn.pairTxId).toBe(out.id);
    const twinsOut = txs.filter((t) => t.description === 'Overføring til Brukskonto' && t.amountOre === -300000);
    const twinsIn = txs.filter((t) => t.description === 'Overføring fra Bolig' && t.amountOre === 300000);
    expect(new Set(twinsOut.map((t) => t.pairTxId))).toEqual(new Set(twinsIn.map((t) => t.id)));
  });

  it('groups persons with aliases and merges across accounts', async () => {
    const persons = await db.persons.toArray();
    const names = persons.map((p) => p.displayName).sort();
    expect(names).toEqual(['Børge Testesen', 'Kari Kasserer', 'Lars Venn', 'Mia Leietaker Hansen', 'Per Lagkasse']);
    const borge = persons.find((p) => p.displayName === 'Børge Testesen')!;
    expect(borge.accountNumbers.sort()).toEqual(['1111 22 39999', '3333 44 55001']);
    expect(borge.aliases.sort()).toEqual(['BØRGE TESTESEN', 'Børge Testesen']);
  });

  it('learns from a correction for all similar transactions', async () => {
    const txs = await db.transactions.toArray();
    const xyzzy = txs.find((t) => t.displayName === 'Xyzzy Handel')!;
    expect(xyzzy.categoryId).toBe(CAT.uavklart);
    await setCategory(db, xyzzy.id!, CAT.hobby, 'all');
    const res = await reclassifyAll(db, TODAY);
    expect(res.changed).toBeGreaterThanOrEqual(1);
    expect((await db.transactions.get(xyzzy.id!))!.categoryId).toBe(CAT.hobby);
    expect(await db.merchantLinks.get('XYZZY HANDEL')).toMatchObject({ categoryId: CAT.hobby });
    // "Bare denne" sets a manual category that reclassification never touches.
    const rema = txs.find((t) => t.description === '31.10 REMA STORGATA OSLO')!;
    await setCategory(db, rema.id!, CAT.matUte, 'this');
    await reclassifyAll(db, TODAY);
    await reclassifyAll(db, TODAY);
    const after = (await db.transactions.get(rema.id!))!;
    expect(after.categoryId).toBe(CAT.matUte);
    expect(after.manual).toBe(true);
    expect(await db.merchantLinks.get(rema.merchantKey)).toBeUndefined();
  });
});

describe('fasit: eksport-2 after eksport-1', () => {
  const fasit = readFasit().filter((r) => r.fil.startsWith('eksport-2'));

  it('classifies the eksport-2 rows with the setup', async () => {
    const db = freshDb();
    await importFiles(db, inputs(EXPORT1_FILES));
    await reclassifyAll(db, TODAY);
    await applyTestSetup(db);
    await importFiles(db, inputs([EXPORT2_FILE]));
    await reclassifyAll(db, TODAY);
    const index = await txIndex(db);
    for (const row of fasit) checkRow(findTx(index, row), row, row.kategori);
  });

  it('classifies the eksport-2 rows without the setup', async () => {
    const db = freshDb();
    await importFiles(db, inputs(EXPORT1_FILES));
    await importFiles(db, inputs([EXPORT2_FILE]));
    await reclassifyAll(db, TODAY);
    const index = await txIndex(db);
    for (const row of fasit) checkRow(findTx(index, row), row, row.uten_oppsett);
  });
});
