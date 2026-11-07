import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups } from '../hooks';
import { fold } from '../../core/text';
import { monthEnd, monthStart } from '../../core/dates';
import { parseAmountNo } from '../../core/money';
import { Button, Field, Sheet, Spinner, Toggle, inputClass } from '../components/basics';
import { TxList } from '../components/TxList';
import { TxDetail } from '../components/TxDetail';
import type { Flag, Transaction } from '../../core/types';

const FLAG_OPTIONS: Array<{ id: Flag | 'reserved' | 'manual'; label: string }> = [
  { id: 'oneOff', label: 'Engangs' },
  { id: 'recurring', label: 'Faste' },
  { id: 'possibleDouble', label: 'Mulig dobbelttrekk' },
  { id: 'refunded', label: 'Refundert' },
  { id: 'refund', label: 'Refusjon' },
  { id: 'lowConfidence', label: 'Usikker' },
  { id: 'reserved', label: 'Reservert' },
  { id: 'manual', label: 'Manuell' },
];

export function Transactions() {
  const { db, settings } = useData();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [hideInternal, setHideInternal] = useState(settings.hideInternal);

  const q = params.get('q') ?? '';
  const accountId = params.get('konto');
  const categoryId = params.get('kategori');
  const direction = params.get('retning');
  const month = params.get('m');
  const from = params.get('fra') ?? (month ? monthStart(month) : '');
  const to = params.get('til') ?? (month ? monthEnd(month) : '');
  const minAmount = params.get('min') ?? '';
  const maxAmount = params.get('max') ?? '';
  const flag = params.get('flagg');

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'm') next.delete('m');
    setParams(next, { replace: true });
  };

  const { data: all, loading } = useAsync(async () => {
    const txs = await db.transactions.toArray();
    txs.sort((a, b) => (a.statDate < b.statDate ? 1 : a.statDate > b.statDate ? -1 : (b.id ?? 0) - (a.id ?? 0)));
    return txs;
  }, [db]);

  const filtered = useMemo(() => {
    if (!all) return [];
    const needle = fold(q);
    const min = parseAmountNo(minAmount);
    const max = parseAmountNo(maxAmount);
    return all.filter((t) => {
      if (hideInternal && t.kind === 'transfer') return false;
      if (accountId && String(t.accountId) !== accountId) return false;
      if (categoryId && t.categoryId !== categoryId && !(t.splits ?? []).some((s) => s.categoryId === categoryId)) return false;
      if (direction && t.direction !== direction) return false;
      if (from && t.statDate < from) return false;
      if (to && t.statDate > to) return false;
      if (min != null && Math.abs(t.amountOre) < min) return false;
      if (max != null && Math.abs(t.amountOre) > max) return false;
      if (flag === 'reserved' && t.status !== 'reserved') return false;
      if (flag === 'manual' && !t.manual) return false;
      if (flag && flag !== 'reserved' && flag !== 'manual' && !t.flags.includes(flag as Flag)) return false;
      if (needle) {
        const hay = fold(`${t.displayName} ${t.description} ${t.message} ${t.counterpartyName} ${t.note} ${t.tags.join(' ')}`);
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [all, q, accountId, categoryId, direction, from, to, minAmount, maxAmount, flag, hideInternal]);

  const openTx = async (id: number) => {
    const tx = await db.transactions.get(id);
    if (tx) setSelected(tx);
  };

  const activeFilters = [accountId, categoryId, direction, from, to, minAmount, maxAmount, flag].filter(Boolean).length;

  if (!lookups) return <Spinner />;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 px-4 pt-3 pb-2">
        <div className="flex gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => set('q', e.target.value || null)}
            placeholder="Søk"
            aria-label="Søk i transaksjoner"
            className={inputClass}
          />
          <Button variant="secondary" onClick={() => setFilterOpen(true)} aria-label="Filtre">
            Filtre{activeFilters > 0 && ` (${activeFilters})`}
          </Button>
        </div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{loading ? 'Laster…' : `${filtered.length} transaksjoner`}</span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hideInternal} onChange={(e) => setHideInternal(e.target.checked)} className="h-5 w-5" />
            Skjul interne overføringer
          </label>
        </div>
      </div>
      <TxList transactions={filtered} ctx={lookups} onSelect={setSelected} className="min-h-0 flex-1" />

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtre" tall>
        <Field label="Konto">
          <select value={accountId ?? ''} onChange={(e) => set('konto', e.target.value || null)} className={inputClass}>
            <option value="">Alle kontoer</option>
            {lookups.accountList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kategori">
          <select value={categoryId ?? ''} onChange={(e) => set('kategori', e.target.value || null)} className={inputClass}>
            <option value="">Alle kategorier</option>
            {lookups.groupList.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {lookups.categoryList
                  .filter((c) => c.groupId === g.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Retning">
          <select value={direction ?? ''} onChange={(e) => set('retning', e.target.value || null)} className={inputClass}>
            <option value="">Inn og ut</option>
            <option value="in">Inn</option>
            <option value="out">Ut</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fra dato">
            <input type="date" value={from} onChange={(e) => set('fra', e.target.value || null)} className={inputClass} />
          </Field>
          <Field label="Til dato">
            <input type="date" value={to} onChange={(e) => set('til', e.target.value || null)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Minste beløp (kr)">
            <input inputMode="decimal" value={minAmount} onChange={(e) => set('min', e.target.value || null)} className={inputClass} />
          </Field>
          <Field label="Største beløp (kr)">
            <input inputMode="decimal" value={maxAmount} onChange={(e) => set('max', e.target.value || null)} className={inputClass} />
          </Field>
        </div>
        <Field label="Flagg">
          <select value={flag ?? ''} onChange={(e) => set('flagg', e.target.value || null)} className={inputClass}>
            <option value="">Alle</option>
            {FLAG_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Toggle checked={hideInternal} onChange={setHideInternal} label="Skjul interne overføringer" />
        <div className="mt-3 flex gap-2 pb-2">
          <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>
            Nullstill
          </Button>
          <Button full onClick={() => setFilterOpen(false)}>
            Vis {filtered.length}
          </Button>
        </div>
      </Sheet>
      <TxDetail tx={selected} ctx={lookups} onClose={() => setSelected(null)} onOpen={openTx} />
    </div>
  );
}
