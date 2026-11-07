import { useMemo, useState } from 'react';
import type { Category, CategoryGroup } from '../../core/types';
import { fold } from '../../core/text';
import { CategoryDot, Sheet, inputClass } from './basics';

export interface CategoryPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (categoryId: string) => void;
  categories: Map<string, Category>;
  groups: Map<string, CategoryGroup>;
  /** Category ids shown first as quick choices. */
  quick?: string[];
  current?: string | null;
  title?: string;
}

export function CategoryPicker({ open, onClose, onPick, categories, groups, quick = [], current, title = 'Velg kategori' }: CategoryPickerProps) {
  const [query, setQuery] = useState('');
  const grouped = useMemo(() => {
    const q = fold(query);
    const byGroup = new Map<string, Category[]>();
    for (const c of categories.values()) {
      if (c.hidden && c.id !== current) continue;
      if (q && !fold(c.name).includes(q)) continue;
      const list = byGroup.get(c.groupId) ?? [];
      list.push(c);
      byGroup.set(c.groupId, list);
    }
    return [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ group: g, items: (byGroup.get(g.id) ?? []).sort((a, b) => a.order - b.order) }))
      .filter((x) => x.items.length > 0);
  }, [categories, groups, query, current]);

  const pick = (id: string) => {
    onPick(id);
    setQuery('');
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} tall>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Søk i kategorier"
        aria-label="Søk i kategorier"
        className={`${inputClass} mb-3`}
      />
      {quick.length > 0 && !query && (
        <div className="mb-3 flex flex-wrap gap-2">
          {quick.map((id) => {
            const c = categories.get(id);
            if (!c) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                className="min-h-10 rounded-full bg-brand-50 px-3 text-sm font-medium text-brand-800 dark:bg-slate-800 dark:text-brand-500"
              >
                {c.icon} {c.name}
              </button>
            );
          })}
        </div>
      )}
      {grouped.map(({ group, items }) => (
        <div key={group.id} className="mb-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: group.color }}>
            {group.name}
          </h3>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pick(c.id)}
                  aria-current={current === c.id ? 'true' : undefined}
                  className="flex min-h-12 w-full items-center gap-3 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <CategoryDot category={c} groups={groups} size="sm" />
                  <span className="flex-1">{c.name}</span>
                  {current === c.id && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Sheet>
  );
}
