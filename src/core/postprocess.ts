import { CAT } from './categories';
import type { Category, Flag, Kind, Person, RecurringGroup, RecurringInterval, Transaction } from './types';
import { addDays, daysBetween, median } from './dates';
import { diffPermyriad } from './money';
import { fold } from './text';

export interface PostContext {
  categories: Map<string, Category>;
  accountNumberById: Map<number, string>;
  personsById: Map<number, Person>;
  oneOffThresholdOre: number;
  /** Today (ISO date) for "stopped" detection. */
  today: string;
}

function kindOf(ctx: PostContext, tx: Transaction): Kind {
  return ctx.categories.get(tx.categoryId)?.kind ?? tx.kind;
}

function setFlag(tx: Transaction, flag: Flag, on: boolean): void {
  const has = tx.flags.includes(flag);
  if (on && !has) tx.flags = [...tx.flags, flag];
  else if (!on && has) tx.flags = tx.flags.filter((f) => f !== flag);
}

const KREDIT = 'KREDITOVERFOERING';
const KID = 'BETALING MED KID INNLAND';

/** Links refunds (Kreditoverføring) to the purchase with the same merchant text and amount within 60 days. */
export function linkRefunds(txs: Transaction[], ctx: PostContext): void {
  const byKey = new Map<string, Transaction[]>();
  for (const tx of txs) {
    if (tx.amountOre >= 0 || !tx.merchantKey) continue;
    const list = byKey.get(tx.merchantKey) ?? [];
    list.push(tx);
    byKey.set(tx.merchantKey, list);
  }
  const refundIds = new Set<number>();
  for (const refund of txs) {
    if (fold(refund.subtype) !== KREDIT || refund.amountOre <= 0) continue;
    refundIds.add(refund.id!);
    setFlag(refund, 'refund', true);
    const candidates = (byKey.get(refund.merchantKey) ?? []).filter(
      (p) =>
        p.amountOre === -refund.amountOre &&
        p.statDate <= refund.statDate &&
        daysBetween(p.statDate, refund.statDate) <= 60 &&
        (p.linkedTxId == null || p.linkedTxId === refund.id),
    );
    candidates.sort((a, b) => (a.statDate < b.statDate ? 1 : -1));
    const purchase = candidates[0];
    if (!purchase) {
      refund.linkedTxId = null;
      continue;
    }
    purchase.linkedTxId = refund.id!;
    setFlag(purchase, 'refunded', true);
    refund.linkedTxId = purchase.id!;
    if (!refund.manual) {
      refund.categoryId = purchase.categoryId;
      refund.kind = kindOf(ctx, purchase);
      refund.source = 'structural';
      refund.confidence = 'høy';
      refund.displayName = purchase.displayName;
      refund.canonicalName = purchase.canonicalName;
      setFlag(refund, 'lowConfidence', false);
    }
  }
  // Clear stale links on purchases whose refund no longer exists.
  for (const tx of txs) {
    if (tx.amountOre < 0 && tx.linkedTxId != null && !refundIds.has(tx.linkedTxId)) {
      tx.linkedTxId = null;
      setFlag(tx, 'refunded', false);
    }
    if (tx.amountOre < 0 && tx.linkedTxId == null) setFlag(tx, 'refunded', false);
  }
}

export function recurringGroupKey(tx: Transaction): string | null {
  if (tx.canonicalName) return `name:${fold(tx.canonicalName)}`;
  if (fold(tx.subtype) === KID && tx.counterpartyAccount) return `acct:${tx.counterpartyAccount}`;
  if (tx.merchantKey) return `key:${tx.merchantKey}`;
  return null;
}

interface Member {
  tx: Transaction;
  currency: string;
  amount: number;
}

function intervalFor(gapDays: number | null): RecurringInterval {
  if (gapDays == null) return null;
  if (gapDays >= 20 && gapDays <= 40) return 'monthly';
  if (gapDays >= 5 && gapDays <= 9) return 'weekly';
  if (gapDays >= 350 && gapDays <= 380) return 'yearly';
  return null;
}

const INTERVAL_DAYS: Record<Exclude<RecurringInterval, null>, number> = { weekly: 7, monthly: 30, yearly: 365 };

/** Finds subscriptions and fixed bills (section 8) and flags their transactions. */
export function detectRecurring(txs: Transaction[], ctx: PostContext): RecurringGroup[] {
  const groups = new Map<string, Member[]>();
  for (const tx of txs) {
    if (tx.amountOre >= 0) continue;
    if (kindOf(ctx, tx) !== 'expense') continue;
    if (tx.flags.includes('refunded')) continue;
    const key = recurringGroupKey(tx);
    if (!key) continue;
    const member: Member = {
      tx,
      currency: tx.card?.currency ?? 'NOK',
      amount: tx.card ? tx.card.amountMinor : -tx.amountOre,
    };
    const list = groups.get(key) ?? [];
    list.push(member);
    groups.set(key, list);
  }

  const result: RecurringGroup[] = [];
  for (const tx of txs) {
    setFlag(tx, 'recurring', false);
    setFlag(tx, 'possibleDouble', false);
    tx.recurringKey = null;
  }

  for (const [key, all] of groups) {
    // Majority currency.
    const curCount = new Map<string, number>();
    for (const m of all) curCount.set(m.currency, (curCount.get(m.currency) ?? 0) + 1);
    let currency = 'NOK';
    let best = -1;
    for (const [c, n] of curCount) {
      if (n > best) {
        currency = c;
        best = n;
      }
    }
    const sameCurrency = all.filter((m) => m.currency === currency);
    // Reference amount: the one with the most neighbours within ±10 %, latest on ties.
    sameCurrency.sort((a, b) => (a.tx.statDate < b.tx.statDate ? -1 : 1));
    let ref: Member | null = null;
    let refCount = -1;
    for (const m of sameCurrency) {
      const n = sameCurrency.filter((o) => diffPermyriad(o.amount, m.amount) <= 1000).length;
      if (n >= refCount) {
        ref = m;
        refCount = n;
      }
    }
    if (!ref) continue;
    const members = sameCurrency.filter((o) => diffPermyriad(o.amount, ref!.amount) <= 1000);
    const fast = members.some((m) => m.tx.fastHint);
    const dates = members.map((m) => m.tx.statDate);
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1]!, dates[i]!));
    const medianGap = median(gaps);
    const interval = intervalFor(medianGap);
    const qualifies = fast ? members.length >= 1 : members.length >= 3 && interval != null;
    if (!qualifies) continue;

    const last = members[members.length - 1]!;
    const prev = members.length >= 2 ? members[members.length - 2]! : null;
    const priceChange = prev != null && diffPermyriad(last.amount, prev.amount) > 200;
    let possibleDouble = false;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (Math.abs(daysBetween(members[i]!.tx.statDate, members[j]!.tx.statDate)) <= 3) {
          possibleDouble = true;
          if (!members[i]!.tx.doubleDismissed) setFlag(members[i]!.tx, 'possibleDouble', true);
          if (!members[j]!.tx.doubleDismissed) setFlag(members[j]!.tx, 'possibleDouble', true);
        }
      }
    }
    for (const m of members) {
      setFlag(m.tx, 'recurring', true);
      m.tx.recurringKey = key;
    }
    const effectiveInterval: Exclude<RecurringInterval, null> = interval ?? 'monthly';
    const nextDate = addDays(last.tx.statDate, INTERVAL_DAYS[effectiveInterval]);
    const stopped = daysBetween(last.tx.statDate, ctx.today) > INTERVAL_DAYS[effectiveInterval] * 1.5;
    const monthlyOre =
      effectiveInterval === 'monthly'
        ? -last.tx.amountOre
        : effectiveInterval === 'weekly'
          ? Math.round((-last.tx.amountOre * 52) / 12)
          : Math.round(-last.tx.amountOre / 12);
    result.push({
      key,
      name: last.tx.displayName || last.tx.merchantName,
      categoryId: last.tx.categoryId,
      currency,
      amountMinor: last.amount,
      amountOre: -last.tx.amountOre,
      monthlyOre,
      interval,
      lastDate: last.tx.statDate,
      nextDate,
      count: members.length,
      isNew: members.length < 2,
      stopped,
      priceChange,
      possibleDouble,
      fast,
      txIds: members.map((m) => m.tx.id!),
    });
  }
  result.sort((a, b) => b.monthlyOre - a.monthlyOre);
  return result;
}

const ONE_OFF_EXEMPT = new Set<string>([CAT.lonn, CAT.nav, CAT.leieinntekt]);

/** Flags large one-off transactions (section 6). */
export function flagOneOffs(txs: Transaction[], ctx: PostContext): void {
  for (const tx of txs) {
    const kind = kindOf(ctx, tx);
    const eligibleKind = kind === 'expense' || kind === 'income' || kind === 'unknown';
    let on: boolean;
    if (tx.oneOffOverride === 'off') on = false;
    else if (tx.oneOffOverride === 'on') on = eligibleKind;
    else {
      on =
        eligibleKind &&
        Math.abs(tx.amountOre) >= ctx.oneOffThresholdOre &&
        !ONE_OFF_EXEMPT.has(tx.categoryId) &&
        !tx.flags.includes('recurring');
    }
    setFlag(tx, 'oneOff', on);
  }
}

/** Pairs both sides of an internal transfer (same amount, opposite sign, swapped accounts, same day). */
export function pairInternalTransfers(txs: Transaction[], ctx: PostContext): void {
  for (const tx of txs) tx.pairTxId = null;
  const incoming = new Map<string, Transaction[]>();
  for (const tx of txs) {
    if (kindOf(ctx, tx) !== 'transfer' || tx.amountOre <= 0) continue;
    const key = `${tx.date}|${tx.amountOre}`;
    const list = incoming.get(key) ?? [];
    list.push(tx);
    incoming.set(key, list);
  }
  for (const out of txs) {
    if (kindOf(ctx, out) !== 'transfer' || out.amountOre >= 0 || out.pairTxId != null) continue;
    const outNumber = ctx.accountNumberById.get(out.accountId) ?? '';
    const list = incoming.get(`${out.date}|${-out.amountOre}`) ?? [];
    const match = list.find(
      (inn) =>
        inn.pairTxId == null &&
        inn.accountId !== out.accountId &&
        (ctx.accountNumberById.get(inn.accountId) ?? '') === out.counterpartyAccount &&
        (inn.counterpartyAccount === '' || inn.counterpartyAccount === outNumber),
    );
    if (match) {
      out.pairTxId = match.id!;
      match.pairTxId = out.id!;
    }
  }
}

/** Effective display name: canonical name, else the person's name, else the cleaned merchant text. */
export function effectiveDisplayName(tx: Transaction, person: Person | null): string {
  if (tx.canonicalName) return tx.canonicalName;
  if (person) return person.displayName;
  return tx.merchantName || tx.counterpartyName || tx.description;
}

/** Runs all post-processing steps in order. Mutates the transactions in place. */
export function postProcess(txs: Transaction[], ctx: PostContext): RecurringGroup[] {
  for (const tx of txs) {
    tx.kind = kindOf(ctx, tx);
    setFlag(tx, 'lowConfidence', tx.confidence === 'lav' && !tx.manual && tx.categoryId !== CAT.uavklart);
    tx.displayName = effectiveDisplayName(tx, tx.personId != null ? (ctx.personsById.get(tx.personId) ?? null) : null);
  }
  linkRefunds(txs, ctx);
  const groups = detectRecurring(txs, ctx);
  flagOneOffs(txs, ctx);
  pairInternalTransfers(txs, ctx);
  return groups;
}
