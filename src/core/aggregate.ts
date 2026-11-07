import type { Category, Kind, Transaction } from './types';
import { addDays, addMonths, monthEnd, monthStart } from './dates';

export interface Entry {
  categoryId: string;
  amountOre: number;
  tx: Transaction;
}

/** A transaction counts as its splits when it has any, otherwise as one entry. */
export function entriesOf(tx: Transaction): Entry[] {
  if (tx.splits && tx.splits.length > 0) {
    return tx.splits.map((s) => ({ categoryId: s.categoryId, amountOre: s.amountOre, tx }));
  }
  return [{ categoryId: tx.categoryId, amountOre: tx.amountOre, tx }];
}

export interface CategoryTotal {
  categoryId: string;
  groupId: string;
  kind: Kind;
  /** Signed sum of amounts. */
  sumOre: number;
  /** Gross out (positive number). */
  outOre: number;
  /** Gross in. */
  inOre: number;
  /** Signed sum of entries from one-off transactions. */
  oneOffOre: number;
  count: number;
}

export interface GroupTotal {
  groupId: string;
  sumOre: number;
  outOre: number;
  inOre: number;
  /** Net spend excluding one-offs (expense groups). */
  normalOre: number;
  count: number;
}

export interface PeriodSummary {
  from: string;
  to: string;
  txCount: number;
  incomeOre: number;
  oneOffIncomeOre: number;
  /** Net spend in expense categories, including one-offs. Refunds reduce it. */
  expenseOre: number;
  /** Net spend excluding one-off transactions. */
  expenseNormalOre: number;
  oneOffExpenseOre: number;
  savingOre: number;
  unknownInOre: number;
  unknownOutOre: number;
  transferInOre: number;
  transferOutOre: number;
  netSavedOre: number;
  /** Net saved / income, in permille. null when there is no income. */
  savingsRatePermille: number | null;
  categories: CategoryTotal[];
  groups: GroupTotal[];
}

/** Sums everything with statDate in [from, to]. Transfers stay outside income, expense and saving. */
export function summarize(txs: Iterable<Transaction>, categories: Map<string, Category>, from: string, to: string): PeriodSummary {
  const cats = new Map<string, CategoryTotal>();
  let txCount = 0;
  let income = 0;
  let oneOffIncome = 0;
  let expense = 0;
  let expenseNormal = 0;
  let oneOffExpense = 0;
  let saving = 0;
  let unknownIn = 0;
  let unknownOut = 0;
  let transferIn = 0;
  let transferOut = 0;
  for (const tx of txs) {
    if (tx.statDate < from || tx.statDate > to) continue;
    txCount++;
    const oneOff = tx.flags.includes('oneOff');
    for (const e of entriesOf(tx)) {
      const cat = categories.get(e.categoryId);
      const kind: Kind = cat?.kind ?? 'unknown';
      let t = cats.get(e.categoryId);
      if (!t) {
        t = { categoryId: e.categoryId, groupId: cat?.groupId ?? 'uavklart', kind, sumOre: 0, outOre: 0, inOre: 0, oneOffOre: 0, count: 0 };
        cats.set(e.categoryId, t);
      }
      t.sumOre += e.amountOre;
      if (e.amountOre < 0) t.outOre += -e.amountOre;
      else t.inOre += e.amountOre;
      if (oneOff) t.oneOffOre += e.amountOre;
      t.count++;
      switch (kind) {
        case 'income':
          income += e.amountOre;
          if (oneOff) oneOffIncome += e.amountOre;
          break;
        case 'expense':
          expense += -e.amountOre;
          if (oneOff) oneOffExpense += -e.amountOre;
          else expenseNormal += -e.amountOre;
          break;
        case 'saving':
          saving += -e.amountOre;
          break;
        case 'transfer':
          if (e.amountOre < 0) transferOut += -e.amountOre;
          else transferIn += e.amountOre;
          break;
        default:
          if (e.amountOre < 0) unknownOut += -e.amountOre;
          else unknownIn += e.amountOre;
      }
    }
  }
  const groups = new Map<string, GroupTotal>();
  for (const t of cats.values()) {
    let g = groups.get(t.groupId);
    if (!g) {
      g = { groupId: t.groupId, sumOre: 0, outOre: 0, inOre: 0, normalOre: 0, count: 0 };
      groups.set(t.groupId, g);
    }
    g.sumOre += t.sumOre;
    g.outOre += t.outOre;
    g.inOre += t.inOre;
    g.count += t.count;
    if (t.kind === 'expense') g.normalOre += -(t.sumOre - t.oneOffOre);
  }
  const netSaved = income - expense;
  return {
    from,
    to,
    txCount,
    incomeOre: income,
    oneOffIncomeOre: oneOffIncome,
    expenseOre: expense,
    expenseNormalOre: expenseNormal,
    oneOffExpenseOre: oneOffExpense,
    savingOre: saving,
    unknownInOre: unknownIn,
    unknownOutOre: unknownOut,
    transferInOre: transferIn,
    transferOutOre: transferOut,
    netSavedOre: netSaved,
    savingsRatePermille: income > 0 ? Math.round((netSaved * 1000) / income) : null,
    categories: [...cats.values()].sort((a, b) => -a.sumOre - -b.sumOre),
    groups: [...groups.values()].sort((a, b) => -a.sumOre - -b.sumOre),
  };
}

export function summarizeMonth(txs: Iterable<Transaction>, categories: Map<string, Category>, month: string): PeriodSummary {
  return summarize(txs, categories, monthStart(month), monthEnd(month));
}

export interface MonthPoint {
  month: string;
  incomeOre: number;
  expenseOre: number;
  expenseNormalOre: number;
  savingOre: number;
  /** Net spend per group (expense groups), including one-offs. */
  groupsOre: Record<string, number>;
  /** Net spend per group excluding one-offs. */
  groupsNormalOre: Record<string, number>;
}

/** Months from `start` to `end` inclusive. */
export function monthRange(start: string, end: string): string[] {
  const out: string[] = [];
  let m = start;
  while (m <= end) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

export function monthlySeries(txs: Transaction[], categories: Map<string, Category>, months: string[]): MonthPoint[] {
  return months.map((month) => {
    const s = summarizeMonth(txs, categories, month);
    const groupsOre: Record<string, number> = {};
    const groupsNormalOre: Record<string, number> = {};
    for (const g of s.groups) {
      const expenseOnly = s.categories.filter((c) => c.groupId === g.groupId && c.kind === 'expense');
      if (expenseOnly.length === 0) continue;
      groupsOre[g.groupId] = expenseOnly.reduce((a, c) => a + -c.sumOre, 0);
      groupsNormalOre[g.groupId] = g.normalOre;
    }
    return {
      month,
      incomeOre: s.incomeOre,
      expenseOre: s.expenseOre,
      expenseNormalOre: s.expenseNormalOre,
      savingOre: s.savingOre,
      groupsOre,
      groupsNormalOre,
    };
  });
}

export interface MerchantTotal {
  name: string;
  outOre: number;
  count: number;
  categoryId: string;
}

/** Top merchants by net expense in the period. */
export function topMerchants(
  txs: Iterable<Transaction>,
  categories: Map<string, Category>,
  from: string,
  to: string,
  limit = 10,
): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>();
  for (const tx of txs) {
    if (tx.statDate < from || tx.statDate > to) continue;
    for (const e of entriesOf(tx)) {
      if ((categories.get(e.categoryId)?.kind ?? 'unknown') !== 'expense') continue;
      const name = tx.displayName || tx.merchantName || tx.description;
      const t = map.get(name) ?? { name, outOre: 0, count: 0, categoryId: e.categoryId };
      t.outOre += -e.amountOre;
      t.count++;
      map.set(name, t);
    }
  }
  return [...map.values()]
    .filter((m) => m.outOre > 0)
    .sort((a, b) => b.outOre - a.outOre)
    .slice(0, limit);
}

export interface FixedVariable {
  fixedOre: number;
  variableOre: number;
}

/** Splits net expense into recurring ("faste") and the rest. */
export function fixedVsVariable(txs: Iterable<Transaction>, categories: Map<string, Category>, from: string, to: string): FixedVariable {
  let fixed = 0;
  let variable = 0;
  for (const tx of txs) {
    if (tx.statDate < from || tx.statDate > to) continue;
    const recurring = tx.flags.includes('recurring');
    for (const e of entriesOf(tx)) {
      if ((categories.get(e.categoryId)?.kind ?? 'unknown') !== 'expense') continue;
      if (recurring) fixed += -e.amountOre;
      else variable += -e.amountOre;
    }
  }
  return { fixedOre: fixed, variableOre: variable };
}

export interface BalancePoint {
  date: string;
  balanceOre: number;
}

/**
 * Balance per day for one account, computed backwards (and forwards) from the anchor
 * (closing balance of the newest import). Uses the bank date, reserved rows included.
 */
export function balanceHistory(
  txs: Iterable<Transaction>,
  anchorBalanceOre: number,
  anchorDate: string,
  from: string,
  to: string,
): BalancePoint[] {
  const deltas = new Map<string, number>();
  for (const tx of txs) deltas.set(tx.date, (deltas.get(tx.date) ?? 0) + tx.amountOre);
  const dates = [...deltas.keys()].sort();
  // cum(d) = sum of amounts with date <= d
  const cumAt = (d: string): number => {
    let sum = 0;
    for (const x of dates) {
      if (x > d) break;
      sum += deltas.get(x)!;
    }
    return sum;
  };
  const cumAnchor = cumAt(anchorDate);
  const points: BalancePoint[] = [];
  let d = from;
  let cum = cumAt(addDays(from, -1));
  while (d <= to) {
    cum += deltas.get(d) ?? 0;
    points.push({ date: d, balanceOre: anchorBalanceOre + cum - cumAnchor });
    d = addDays(d, 1);
  }
  return points;
}

/** Sums several balance series day by day. */
export function sumBalanceSeries(series: BalancePoint[][]): BalancePoint[] {
  if (series.length === 0) return [];
  const first = series[0]!;
  return first.map((p, i) => ({
    date: p.date,
    balanceOre: series.reduce((a, s) => a + (s[i]?.balanceOre ?? 0), 0),
  }));
}
