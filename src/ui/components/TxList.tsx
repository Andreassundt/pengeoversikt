import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Account, Category, CategoryGroup, Transaction } from '../../core/types';
import { formatDateShort, weekdayName } from '../../core/dates';
import { formatMinor } from '../../core/money';
import { Amount, Badge, CategoryDot } from './basics';
import { cn } from '../data';

export interface TxContext {
  categories: Map<string, Category>;
  groups: Map<string, CategoryGroup>;
  accounts: Map<number, Account>;
}

export function flagBadges(tx: Transaction) {
  const out: Array<{ text: string; tone: 'neutral' | 'warn' | 'good' | 'bad' | 'info' }> = [];
  if (tx.status === 'reserved') out.push({ text: 'Reservert', tone: 'neutral' });
  if (tx.flags.includes('oneOff')) out.push({ text: 'Engangs', tone: 'info' });
  if (tx.flags.includes('recurring')) out.push({ text: 'Fast', tone: 'neutral' });
  if (tx.flags.includes('possibleDouble')) out.push({ text: 'Dobbelt?', tone: 'warn' });
  if (tx.flags.includes('refunded')) out.push({ text: 'Refundert', tone: 'good' });
  if (tx.flags.includes('refund')) out.push({ text: 'Refusjon', tone: 'good' });
  if (tx.flags.includes('lowConfidence')) out.push({ text: 'Usikker', tone: 'warn' });
  if (tx.manual) out.push({ text: 'Manuell', tone: 'neutral' });
  return out;
}

export function TxRow({ tx, ctx, onClick, showAccount = true }: { tx: Transaction; ctx: TxContext; onClick?: (tx: Transaction) => void; showAccount?: boolean }) {
  const category = ctx.categories.get(tx.categoryId);
  const account = ctx.accounts.get(tx.accountId);
  const badges = flagBadges(tx);
  const sub = [category?.name ?? tx.categoryId, showAccount ? account?.name : null].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={() => onClick?.(tx)}
      className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
    >
      <CategoryDot category={category} groups={ctx.groups} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{tx.displayName || tx.description}</div>
        <div className="truncate text-sm text-slate-500 dark:text-slate-400">
          {sub}
          {tx.splits && tx.splits.length > 0 && ' · splittet'}
        </div>
        {badges.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <Badge key={b.text} tone={b.tone}>
                {b.text}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <Amount ore={tx.amountOre} colored className="font-semibold" />
        {tx.card && tx.card.currency !== 'NOK' && (
          <div className="amount text-xs text-slate-500">{formatMinor(tx.card.amountMinor, tx.card.currency)}</div>
        )}
      </div>
    </button>
  );
}

type Item = { kind: 'day'; date: string; sumOre: number } | { kind: 'tx'; tx: Transaction };

/** Day-grouped, virtualised list. The parent must give it a scrollable container via `className`. */
export function TxList({
  transactions,
  ctx,
  onSelect,
  className,
  emptyText = 'Ingen transaksjoner.',
}: {
  transactions: Transaction[];
  ctx: TxContext;
  onSelect: (tx: Transaction) => void;
  className?: string;
  emptyText?: string;
}) {
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let currentDay = '';
    let dayIndex = -1;
    for (const tx of transactions) {
      if (tx.statDate !== currentDay) {
        currentDay = tx.statDate;
        out.push({ kind: 'day', date: tx.statDate, sumOre: 0 });
        dayIndex = out.length - 1;
      }
      const day = out[dayIndex] as Extract<Item, { kind: 'day' }>;
      if (tx.kind !== 'transfer') day.sumOre += tx.amountOre;
      out.push({ kind: 'tx', tx });
    }
    return out;
  }, [transactions]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (items[i]!.kind === 'day' ? 36 : 68),
    overscan: 12,
  });

  if (transactions.length === 0) {
    return <div className={cn('px-6 py-12 text-center text-slate-500', className)}>{emptyText}</div>;
  }

  return (
    <div ref={parentRef} className={cn('overflow-y-auto', className)}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((v) => {
          const item = items[v.index]!;
          return (
            <div
              key={v.key}
              data-index={v.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
            >
              {item.kind === 'day' ? (
                <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <span>
                    {weekdayName(item.date)} {formatDateShort(item.date)}
                  </span>
                  <Amount ore={item.sumOre} decimals={0} unit={false} className="font-normal normal-case" />
                </div>
              ) : (
                <TxRow tx={item.tx} ctx={ctx} onClick={onSelect} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
