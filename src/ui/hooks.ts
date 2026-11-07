import { useMemo, useRef } from 'react';
import { useAsync, useData } from './data';
import type { Account, Category, CategoryGroup } from '../core/types';
import type { TxContext } from './components/TxList';

export interface Lookups extends TxContext {
  accountList: Account[];
  categoryList: Category[];
  groupList: CategoryGroup[];
}

/** Categories, groups and accounts as maps, reloaded when data changes. */
export function useLookups(): Lookups | null {
  const { db } = useData();
  const { data } = useAsync(
    async () => {
      const [cats, groups, accounts] = await Promise.all([db.categories.toArray(), db.groups.toArray(), db.accounts.toArray()]);
      return { cats, groups, accounts };
    },
    [db],
  );
  return useMemo(() => {
    if (!data) return null;
    return {
      categories: new Map(data.cats.map((c) => [c.id, c])),
      groups: new Map(data.groups.map((g) => [g.id, g])),
      accounts: new Map(data.accounts.map((a) => [a.id!, a])),
      accountList: data.accounts,
      categoryList: data.cats.sort((a, b) => a.order - b.order),
      groupList: data.groups.sort((a, b) => a.order - b.order),
    };
  }, [data]);
}

/** Horizontal swipe detection for month navigation. */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      const t = e.changedTouches[0];
      start.current = null;
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
        if (dx < 0) onLeft();
        else onRight();
      }
    },
  };
}
