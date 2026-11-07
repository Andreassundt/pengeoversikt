import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { PengeDb } from '../../src/db/schema';
import { importFiles } from '../../src/db/importer';
import { reclassifyAll } from '../../src/db/reclassify';
import { EXPORT1_FILES, readFixture } from './helpers';
import { CAT, DEFAULT_CATEGORIES } from '../../src/core/categories';
import { setPersonDefault } from '../../src/db/actions';
import { loadCategoryMap } from '../../src/db/repo';
import { balanceHistory, fixedVsVariable, monthlySeries, summarizeMonth, topMerchants } from '../../src/core/aggregate';
import type { Transaction } from '../../src/core/types';

const TODAY = '2026-11-10';
const NAME_BY_ID = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));

describe('October 2026 numbers (section 13)', () => {
  let db: PengeDb;
  let txs: Transaction[];
  let categories: Map<string, ReturnType<typeof DEFAULT_CATEGORIES.find> & object>;

  beforeAll(async () => {
    db = new PengeDb(`test-agg-${Date.now()}`);
    await importFiles(db, EXPORT1_FILES.map((f) => ({ name: path.basename(f), text: readFixture(f) })));
    await reclassifyAll(db, TODAY);
    const mia = (await db.persons.toArray()).find((p) => p.nameFolded === 'MIA LEIETAKER HANSEN')!;
    const accounts = await db.accounts.toArray();
    const bolig = accounts.find((a) => a.name === 'Bolig')!;
    const bruks = accounts.find((a) => a.name === 'Brukskonto')!;
    await setPersonDefault(db, mia.id!, { direction: 'in', accountId: bolig.id!, categoryId: CAT.leieinntekt });
    await setPersonDefault(db, mia.id!, { direction: 'in', accountId: bruks.id!, categoryId: CAT.deltHusholdning });
    await setPersonDefault(db, mia.id!, { direction: 'out', accountId: bruks.id!, categoryId: CAT.deltHusholdning });
    await reclassifyAll(db, TODAY);
    txs = await db.transactions.toArray();
    categories = (await loadCategoryMap(db)) as never;
  });

  it('matches the expense table', () => {
    const s = summarizeMonth(txs, categories as never, '2026-10');
    const expense = Object.fromEntries(
      s.categories.filter((c) => c.kind === 'expense').map((c) => [NAME_BY_ID.get(c.categoryId), -c.sumOre]),
    );
    expect(expense).toEqual({
      'Møbler og interiør': 2399850,
      Elektronikk: 1185900,
      'Renter boliglån': 846700,
      Felleskostnader: 601500,
      'Programvare og AI': 261238,
      Drivstoff: 241341,
      Dagligvarer: 169190,
      'Strøm og nettleie': 160000,
      Forsikring: 78534,
      'Internett og mobil': 53969,
      'Delt husholdning': 50000,
      Strømmetjenester: 34800,
      'Mat ute': 32090,
      'Spill og apper': 30000,
      'Sport og trening': 17390,
      Gebyrer: 13015,
      'Helse og apotek': 8770,
      Kantine: 3600,
    });
    expect(s.expenseOre).toBe(6187887);
    expect(s.oneOffExpenseOre).toBe(2199950);
    expect(s.expenseNormalOre).toBe(3987937);
  });

  it('matches income, saving, unknown and net saved', () => {
    const s = summarizeMonth(txs, categories as never, '2026-10');
    const income = Object.fromEntries(s.categories.filter((c) => c.kind === 'income').map((c) => [NAME_BY_ID.get(c.categoryId), c.sumOre]));
    expect(income).toEqual({ Lønn: 3172030, Leieinntekt: 1300000, 'NAV og trygd': 355800 });
    expect(s.incomeOre).toBe(4827830);
    const saving = Object.fromEntries(s.categories.filter((c) => c.kind === 'saving').map((c) => [NAME_BY_ID.get(c.categoryId), -c.sumOre]));
    expect(saving).toEqual({ 'Avdrag boliglån': 497200, 'Boligkjøp og egenkapital': -207868 });
    expect(s.unknownOutOre).toBe(3230);
    expect(s.unknownInOre).toBe(0);
    expect(s.netSavedOre).toBe(-1360057);
    expect(s.savingsRatePermille).toBe(-282);
  });

  it('builds monthly series, top merchants and fixed vs variable', () => {
    const series = monthlySeries(txs, categories as never, ['2026-08', '2026-09', '2026-10']);
    expect(series.map((p) => p.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(series[2]!.expenseOre).toBe(6187887);
    expect(series[2]!.groupsOre['hjem']).toBe(2399850);
    expect(series[2]!.groupsNormalOre['hjem']).toBe(199900);
    const top = topMerchants(txs, categories as never, '2026-10-01', '2026-10-31', 3);
    expect(top[0]).toMatchObject({ name: 'Alna Møbel', outOre: 2199950 });
    const fv = fixedVsVariable(txs, categories as never, '2026-10-01', '2026-10-31');
    expect(fv.fixedOre + fv.variableOre).toBe(6187887);
    expect(fv.fixedOre).toBe(2900 + 24519 + 114900 + 118919 + 7900 + 26900 + 53969 + 78534);
  });

  it('computes balance history backwards from the anchor', async () => {
    const bruks = (await db.accounts.toArray()).find((a) => a.name === 'Brukskonto')!;
    const own = txs.filter((t) => t.accountId === bruks.id);
    const points = balanceHistory(own, bruks.balanceOre, bruks.balanceDate!, '2026-11-01', '2026-11-07');
    expect(points[points.length - 1]!.balanceOre).toBe(1357635);
    // Before 06.11 the two transfers of that day (20 000 in, 32 000 out, reserved 53,50 + 157 out) had not happened.
    const nov5 = points.find((p) => p.date === '2026-11-05')!;
    expect(nov5.balanceOre).toBe(1357635 - 2000000 + 3200000 + 5350 + 15700);
  });
});
