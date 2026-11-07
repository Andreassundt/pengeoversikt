import { PengeDb } from '../db/schema';
import type { Account, Category, Person, RecurringGroup, Transaction } from '../core/types';
import {
  balanceHistory,
  fixedVsVariable,
  monthlySeries,
  summarize,
  summarizeMonth,
  sumBalanceSeries,
  topMerchants,
} from '../core/aggregate';
import { addMonths, monthEnd, monthStart } from '../core/dates';
import { reclassifyAll } from '../db/reclassify';
import { CAT } from '../core/categories';
import type {
  EngineRequest,
  OverviewResponse,
  PersonStatsResponse,
  ReclassifyResponse,
  ReviewResponse,
  StatisticsResponse,
  WizardResponse,
} from './protocol';

interface Cache {
  txs: Transaction[];
  categories: Map<string, Category>;
  accounts: Account[];
  persons: Person[];
  memo: Map<string, unknown>;
}

let db: PengeDb | null = null;
let cache: Cache | null = null;
let recurring: RecurringGroup[] | null = null;

export function setDb(instance: PengeDb): void {
  db = instance;
  invalidate();
}

function getDb(): PengeDb {
  if (!db) db = new PengeDb();
  return db;
}

export function invalidate(): void {
  cache = null;
  recurring = null;
}

async function load(): Promise<Cache> {
  if (cache) return cache;
  const d = getDb();
  const [txs, cats, accounts, persons] = await Promise.all([
    d.transactions.toArray(),
    d.categories.toArray(),
    d.accounts.toArray(),
    d.persons.toArray(),
  ]);
  txs.sort((a, b) => (a.statDate < b.statDate ? 1 : a.statDate > b.statDate ? -1 : (b.id ?? 0) - (a.id ?? 0)));
  cache = { txs, categories: new Map(cats.map((c) => [c.id, c])), accounts, persons, memo: new Map() };
  return cache;
}

async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const c = await load();
  if (c.memo.has(key)) return c.memo.get(key) as T;
  const value = await fn();
  c.memo.set(key, value);
  return value;
}

async function recurringGroups(today: string): Promise<RecurringGroup[]> {
  if (recurring) return recurring;
  const result = await reclassifyAll(getDb(), today);
  if (result.written > 0) invalidate();
  recurring = result.groups;
  return recurring;
}

async function reviewQueue(): Promise<ReviewResponse> {
  return memo('review', async () => {
    const c = await load();
    const unknown = c.txs.filter((t) => t.categoryId === CAT.uavklart);
    const lowConfidence = c.txs.filter((t) => t.flags.includes('lowConfidence') && t.categoryId !== CAT.uavklart);
    const oneOffs = c.txs.filter((t) => t.flags.includes('oneOff') && !t.oneOffConfirmed);
    const doubles = c.txs.filter((t) => t.flags.includes('possibleDouble'));
    const newPersons = c.persons.filter((p) => !p.reviewed);
    const importWarnings = (await getDb().imports.toArray()).filter((r) => !r.undone && r.warnings.length > 0 && !r.warningsAcknowledged);
    return {
      unknown,
      lowConfidence,
      oneOffs,
      doubles,
      newPersons,
      importWarnings,
      total: unknown.length + lowConfidence.length + oneOffs.length + doubles.length + newPersons.length + importWarnings.length,
    };
  });
}

async function overview(month: string, today: string): Promise<OverviewResponse> {
  const c = await load();
  const summary = await memo(`month:${month}`, async () => summarizeMonth(c.txs, c.categories, month));
  const prev = [addMonths(month, -1), addMonths(month, -2), addMonths(month, -3)];
  const prevSummaries = await Promise.all(prev.map((m) => memo(`month:${m}`, async () => summarizeMonth(c.txs, c.categories, m))));
  const withData = prevSummaries.filter((s) => s.txCount > 0);
  const previousNormalAvgOre = withData.length > 0 ? Math.round(withData.reduce((a, s) => a + s.expenseNormalOre, 0) / withData.length) : null;
  const topCategories = summary.categories.filter((t) => t.kind === 'expense' && t.sumOre < 0).sort((a, b) => a.sumOre - b.sumOre).slice(0, 6);
  const recent = c.txs.filter((t) => t.kind !== 'transfer').slice(0, 8);
  const groups = await recurringGroups(today);
  const from = monthStart(month);
  const to = monthEnd(month);
  const monthGroups = groups.filter((g) => c.txs.some((t) => g.txIds.includes(t.id!) && t.statDate >= from && t.statDate <= to));
  const recurringMonthlyOre = monthGroups.reduce((a, g) => {
    const inMonth = c.txs.filter((t) => g.txIds.includes(t.id!) && t.statDate >= from && t.statDate <= to);
    return a + inMonth.reduce((x, t) => x + -t.amountOre, 0);
  }, 0);
  const review = await reviewQueue();
  const lastImportAt = c.accounts.reduce<string | null>((a, acc) => (acc.lastImportAt && (!a || acc.lastImportAt > a) ? acc.lastImportAt : a), null);
  return {
    month,
    summary,
    previousNormalAvgOre,
    topCategories,
    recent,
    accounts: c.accounts,
    totalBalanceOre: c.accounts.filter((a) => !a.hidden).reduce((a, acc) => a + acc.balanceOre, 0),
    recurringMonthlyOre,
    recurringCount: monthGroups.length,
    reviewCount: review.total,
    lastImportAt,
    hasData: c.txs.length > 0,
  };
}

async function statistics(from: string, to: string, months: string[]): Promise<StatisticsResponse> {
  return memo(`stats:${from}:${to}:${months.join(',')}`, async () => {
    const c = await load();
    const series = monthlySeries(c.txs, c.categories, months);
    const perAccount = c.accounts
      .filter((a) => !a.hidden && a.balanceDate)
      .map((a) =>
        balanceHistory(
          c.txs.filter((t) => t.accountId === a.id),
          a.balanceOre,
          a.balanceDate!,
          from,
          to,
        ),
      );
    return {
      summary: summarize(c.txs, c.categories, from, to),
      series,
      topMerchants: topMerchants(c.txs, c.categories, from, to, 10),
      fixedVariable: fixedVsVariable(c.txs, c.categories, from, to),
      balance: sumBalanceSeries(perAccount),
    };
  });
}

async function personStats(personId: number, months: string[]): Promise<PersonStatsResponse> {
  const c = await load();
  const transactions = c.txs.filter((t) => t.personId === personId);
  const perMonth = months.map((month) => {
    const from = monthStart(month);
    const to = monthEnd(month);
    let inOre = 0;
    let outOre = 0;
    for (const t of transactions) {
      if (t.statDate < from || t.statDate > to) continue;
      if (t.amountOre > 0) inOre += t.amountOre;
      else outOre += -t.amountOre;
    }
    return { month, inOre, outOre };
  });
  return {
    months: perMonth,
    inOre: transactions.reduce((a, t) => a + (t.amountOre > 0 ? t.amountOre : 0), 0),
    outOre: transactions.reduce((a, t) => a + (t.amountOre < 0 ? -t.amountOre : 0), 0),
    transactions,
  };
}

async function wizard(): Promise<WizardResponse> {
  const c = await load();
  const accountName = new Map(c.accounts.map((a) => [a.id!, a.name]));
  const personTx = new Map<number, Transaction[]>();
  for (const t of c.txs) {
    if (t.personId == null) continue;
    const list = personTx.get(t.personId) ?? [];
    list.push(t);
    personTx.set(t.personId, list);
  }
  const personLines: WizardResponse['personLines'] = [];
  for (const p of c.persons) {
    const list = personTx.get(p.id!) ?? [];
    const total = list.reduce((a, t) => a + Math.abs(t.amountOre), 0);
    if (list.length < 3 && total < 5000_00) continue;
    const lines = new Map<string, WizardResponse['personLines'][number]>();
    for (const t of list) {
      const key = `${t.direction}|${t.accountId}`;
      const line = lines.get(key) ?? {
        personId: p.id!,
        personName: p.displayName,
        direction: t.direction,
        accountId: t.accountId,
        accountName: accountName.get(t.accountId) ?? '',
        count: 0,
        sumOre: 0,
        currentCategoryId: null,
      };
      line.count++;
      line.sumOre += Math.abs(t.amountOre);
      lines.set(key, line);
    }
    for (const line of lines.values()) {
      const def = p.defaults.find((d) => d.direction === line.direction && (d.accountId == null || d.accountId === line.accountId));
      line.currentCategoryId = def?.categoryId ?? null;
      personLines.push(line);
    }
  }
  personLines.sort((a, b) => b.sumOre - a.sumOre);
  const oneOffs = c.txs.filter((t) => t.flags.includes('oneOff'));
  const unknownMap = new Map<string, WizardResponse['unknownMerchants'][number]>();
  for (const t of c.txs) {
    if (t.categoryId !== CAT.uavklart || !t.merchantKey || t.personId != null) continue;
    const u = unknownMap.get(t.merchantKey) ?? { merchantKey: t.merchantKey, name: t.displayName, count: 0, sumOre: 0, sampleTxId: t.id! };
    u.count++;
    u.sumOre += Math.abs(t.amountOre);
    unknownMap.set(t.merchantKey, u);
  }
  const unknownMerchants = [...unknownMap.values()].sort((a, b) => b.count - a.count || b.sumOre - a.sumOre).slice(0, 15);
  return { accounts: c.accounts, personLines, oneOffs, unknownMerchants };
}

/** Handles one request. Used by the Web Worker and as an in-thread fallback. */
export async function handleRequest(req: EngineRequest): Promise<unknown> {
  switch (req.type) {
    case 'invalidate':
      invalidate();
      return null;
    case 'reclassify': {
      const r = await reclassifyAll(getDb(), req.today);
      invalidate();
      recurring = r.groups;
      const res: ReclassifyResponse = { changed: r.changed, written: r.written, total: r.total };
      return res;
    }
    case 'overview':
      return overview(req.month, req.today);
    case 'statistics':
      return statistics(req.from, req.to, req.months);
    case 'recurring':
      return recurringGroups(req.today);
    case 'balanceHistory': {
      const c = await load();
      const accounts = c.accounts.filter((a) => (req.accountId == null ? !a.hidden : a.id === req.accountId) && a.balanceDate);
      return sumBalanceSeries(
        accounts.map((a) =>
          balanceHistory(
            c.txs.filter((t) => t.accountId === a.id),
            a.balanceOre,
            a.balanceDate!,
            req.from,
            req.to,
          ),
        ),
      );
    }
    case 'review':
      return reviewQueue();
    case 'personStats':
      return personStats(req.personId, req.months);
    case 'wizard':
      return wizard();
  }
}
