import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data';
import { useLookups } from '../hooks';
import type { Category, Kind } from '../../core/types';
import { Button, Card, CategoryDot, Field, PageHeader, Sheet, Spinner, Toggle, inputClass } from '../components/basics';
import { CategoryPicker } from '../components/CategoryPicker';
import { CAT } from '../../core/categories';

const KIND_LABELS: Record<Kind, string> = { income: 'Inntekt', expense: 'Utgift', saving: 'Sparing', transfer: 'Overføring', unknown: 'Uavklart' };

export function Categories() {
  const { db, mutate } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Category | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!lookups) return <Spinner />;

  const save = async (c: Category) => {
    await mutate(() => db.categories.put(c).then(() => undefined));
    setEditing(null);
  };

  const merge = async (fromId: string, intoId: string) => {
    await mutate(async () => {
      await db.transactions.where('categoryId').equals(fromId).modify({ categoryId: intoId });
      await db.transactions
        .filter((t) => (t.splits ?? []).some((s) => s.categoryId === fromId))
        .modify((t) => {
          t.splits = (t.splits ?? []).map((s) => (s.categoryId === fromId ? { ...s, categoryId: intoId } : s));
        });
      await db.merchantLinks.where('categoryId').equals(intoId).count();
      await db.merchantLinks.filter((l) => l.categoryId === fromId).modify({ categoryId: intoId });
      await db.rules.filter((r) => r.categoryId === fromId).modify({ categoryId: intoId });
      await db.persons.toCollection().modify((p) => {
        p.defaults = p.defaults.map((d) => (d.categoryId === fromId ? { ...d, categoryId: intoId } : d));
      });
      if (Object.values(CAT).includes(fromId as never)) await db.categories.update(fromId, { hidden: true });
      else await db.categories.delete(fromId);
    });
    setMergeOpen(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader title="Kategorier" back={() => navigate('/mer')} right={<Button variant="ghost" onClick={() => setAdding(true)}>+ Ny</Button>} />
      <div className="space-y-3 p-4">
        {lookups.groupList.map((g) => (
          <Card key={g.id} className="p-0">
            <h2 className="flex items-center gap-2 px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
              {g.name}
            </h2>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lookups.categoryList
                .filter((c) => c.groupId === g.id)
                .map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setEditing(c)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left">
                      <CategoryDot category={c} groups={lookups.groups} size="sm" />
                      <span className={c.hidden ? 'text-slate-400 line-through' : ''}>{c.name}</span>
                      <span className="ml-auto text-xs text-slate-400">{KIND_LABELS[c.kind]}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>

      <CategoryEditor
        category={editing}
        groups={lookups.groupList}
        onClose={() => setEditing(null)}
        onSave={save}
        onMerge={() => setMergeOpen(true)}
      />
      <CategoryEditor
        category={
          adding
            ? { id: `egen-${Date.now().toString(36)}`, name: '', groupId: 'annet', kind: 'expense', hidden: false, order: 999, icon: '🏷️' }
            : null
        }
        groups={lookups.groupList}
        onClose={() => setAdding(false)}
        onSave={async (c) => {
          await save(c);
          setAdding(false);
        }}
        isNew
      />
      <CategoryPicker
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        categories={lookups.categories}
        groups={lookups.groups}
        title={`Slå ${editing?.name ?? ''} sammen med…`}
        onPick={(id) => {
          if (editing && id !== editing.id) void merge(editing.id, id);
        }}
      />
    </div>
  );
}

function CategoryEditor({
  category,
  groups,
  onClose,
  onSave,
  onMerge,
  isNew,
}: {
  category: Category | null;
  groups: Array<{ id: string; name: string; color: string }>;
  onClose: () => void;
  onSave: (c: Category) => Promise<void>;
  onMerge?: () => void;
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState<Category | null>(null);
  const current = draft && draft.id === category?.id ? draft : category;
  if (!current) return null;
  const update = (patch: Partial<Category>) => setDraft({ ...current, ...patch });
  return (
    <Sheet open={category != null} onClose={() => { setDraft(null); onClose(); }} title={isNew ? 'Ny kategori' : 'Rediger kategori'}>
      <Field label="Navn">
        <input value={current.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ikon">
          <input value={current.icon ?? ''} onChange={(e) => update({ icon: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Farge (valgfri)">
          <input type="color" value={current.color ?? groups.find((g) => g.id === current.groupId)?.color ?? '#94a3b8'} onChange={(e) => update({ color: e.target.value })} className="h-11 w-full" />
        </Field>
      </div>
      <Field label="Gruppe">
        <select value={current.groupId} onChange={(e) => update({ groupId: e.target.value })} className={inputClass}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Art" hint="Styrer om beløpene telles som inntekt, forbruk, sparing eller overføring.">
        <select value={current.kind} onChange={(e) => update({ kind: e.target.value as Kind })} className={inputClass}>
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      {!isNew && <Toggle checked={current.hidden} onChange={(v) => update({ hidden: v })} label="Skjul kategorien" />}
      <div className="mt-3 flex gap-2 pb-2">
        <Button full onClick={() => onSave({ ...current, color: current.color || undefined })} disabled={!current.name.trim()}>
          Lagre
        </Button>
        {!isNew && onMerge && (
          <Button variant="secondary" onClick={onMerge}>
            Slå sammen…
          </Button>
        )}
      </div>
    </Sheet>
  );
}
