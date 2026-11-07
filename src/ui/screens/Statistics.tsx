import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups } from '../hooks';
import { addMonths, formatMonth, monthEnd, monthKey, monthStart, todayIso } from '../../core/dates';
import { monthRange } from '../../core/aggregate';
import { Amount, Card, SectionTitle, Spinner, Toggle, inputClass } from '../components/basics';
import { BalanceLine, BarList, IncomeExpenseBars, StackedMonths } from '../components/Charts';
import { cn } from '../data';

type Mode = 'month' | 'quarter' | 'year' | 'custom';

function periodFor(mode: Mode, anchor: string, custom: { from: string; to: string }): { from: string; to: string; label: string } {
  if (mode === 'month') return { from: monthStart(anchor), to: monthEnd(anchor), label: formatMonth(anchor) };
  if (mode === 'quarter') {
    const m = Number(anchor.slice(5, 7));
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const start = `${anchor.slice(0, 4)}-${String(qStartMonth).padStart(2, '0')}`;
    const end = addMonths(start, 2);
    return { from: monthStart(start), to: monthEnd(end), label: `${Math.floor((m - 1) / 3) + 1}. kvartal ${anchor.slice(0, 4)}` };
  }
  if (mode === 'year') return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31`, label: anchor.slice(0, 4) };
  return { from: custom.from, to: custom.to, label: `${custom.from} – ${custom.to}` };
}

export function Statistics() {
  const { engine, settings } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const current = monthKey(todayIso());
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(current);
  const [custom, setCustom] = useState({ from: monthStart(addMonths(current, -2)), to: monthEnd(current) });
  const [span, setSpan] = useState<6 | 12>(6);
  const [normal, setNormal] = useState(true);
  const [group, setGroup] = useState<string | null>(null);

  const period = periodFor(mode, anchor, custom);
  const months = useMemo(() => monthRange(addMonths(monthKey(period.to), -(span - 1)), monthKey(period.to)), [period.to, span]);
  const { data, loading } = useAsync(() => engine.statistics(period.from, period.to, months), [period.from, period.to, months.join(',')]);

  const step = (delta: number) => {
    if (mode === 'month') setAnchor(addMonths(anchor, delta));
    else if (mode === 'quarter') setAnchor(addMonths(anchor, 3 * delta));
    else if (mode === 'year') setAnchor(addMonths(anchor, 12 * delta));
  };

  if (!lookups) return <Spinner />;
  const s = data?.summary;

  const groupItems =
    s?.groups
      .filter((g) => {
        const cats = s.categories.filter((c) => c.groupId === g.groupId && c.kind === 'expense');
        return cats.length > 0;
      })
      .map((g) => {
        const cats = s.categories.filter((c) => c.groupId === g.groupId && c.kind === 'expense');
        const ore = cats.reduce((a, c) => a + (normal ? -(c.sumOre - c.oneOffOre) : -c.sumOre), 0);
        return { groupId: g.groupId, label: lookups.groups.get(g.groupId)?.name ?? g.groupId, ore, color: lookups.groups.get(g.groupId)?.color ?? '#94a3b8' };
      })
      .filter((g) => g.ore !== 0)
      .sort((a, b) => b.ore - a.ore) ?? [];

  const drill = group && s
    ? s.categories
        .filter((c) => c.groupId === group && c.kind === 'expense')
        .map((c) => {
          const ore = normal ? -(c.sumOre - c.oneOffOre) : -c.sumOre;
          const monthsWithData = data!.series.length;
          const avg = monthsWithData > 0 ? Math.round(data!.series.reduce((a, p) => a + ((normal ? p.groupsNormalOre : p.groupsOre)[group] ?? 0), 0) / monthsWithData) : 0;
          return { categoryId: c.categoryId, label: lookups.categories.get(c.categoryId)?.name ?? c.categoryId, ore, avg, count: c.count };
        })
        .sort((a, b) => b.ore - a.ore)
    : null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
        {(['month', 'quarter', 'year', 'custom'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn('min-h-10 flex-1 rounded-lg text-sm font-medium', mode === m ? 'bg-white shadow dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300')}
          >
            {m === 'month' ? 'Måned' : m === 'quarter' ? 'Kvartal' : m === 'year' ? 'År' : 'Egen'}
          </button>
        ))}
      </div>
      {mode !== 'custom' ? (
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => step(-1)} aria-label="Forrige periode" className="h-11 w-11 rounded-full text-2xl">
            ‹
          </button>
          <h2 className="text-lg font-semibold capitalize">{period.label}</h2>
          <button type="button" onClick={() => step(1)} aria-label="Neste periode" className="h-11 w-11 rounded-full text-2xl">
            ›
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={inputClass} aria-label="Fra" />
          <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={inputClass} aria-label="Til" />
        </div>
      )}

      {loading && !data ? (
        <Spinner />
      ) : s ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card className="p-3">
              <div className="text-xs text-slate-500">Inntekt</div>
              <div className="font-semibold">
                <Amount ore={s.incomeOre} decimals={0} unit={false} />
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-slate-500">{normal ? 'Normalt forbruk' : 'Forbruk'}</div>
              <div className="font-semibold">
                <Amount ore={normal ? s.expenseNormalOre : s.expenseOre} decimals={0} unit={false} />
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-slate-500">Sparing</div>
              <div className="font-semibold">
                <Amount ore={s.savingOre} decimals={0} unit={false} />
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle
              action={
                <div className="flex gap-1 text-sm">
                  <button type="button" onClick={() => setSpan(6)} className={cn('rounded-lg px-2 py-1', span === 6 && 'bg-slate-200 dark:bg-slate-700')}>
                    6 mnd
                  </button>
                  <button type="button" onClick={() => setSpan(12)} className={cn('rounded-lg px-2 py-1', span === 12 && 'bg-slate-200 dark:bg-slate-700')}>
                    12 mnd
                  </button>
                </div>
              }
            >
              Forbruk per måned
            </SectionTitle>
            <StackedMonths series={data!.series} groups={lookups.groups} normal={normal} onMonth={(m) => { setMode('month'); setAnchor(m); }} />
            <Toggle checked={!normal} onChange={(v) => setNormal(!v)} label="Ta med engangsposter" />
            <div className="flex flex-wrap gap-2 text-xs">
              {lookups.groupList
                .filter((g) => data!.series.some((p) => (p.groupsOre[g.id] ?? 0) !== 0))
                .map((g) => (
                  <span key={g.id} className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: g.color }} /> {g.name}
                  </span>
                ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>Inn, ut og sparing</SectionTitle>
            <IncomeExpenseBars series={data!.series} />
          </Card>

          <Card>
            <SectionTitle action={group && <button type="button" onClick={() => setGroup(null)} className="text-sm text-brand-700">‹ Alle grupper</button>}>
              {group ? lookups.groups.get(group)?.name : 'Grupper'}
            </SectionTitle>
            {!group ? (
              <BarList hideAmounts={settings.hideAmounts} items={groupItems.map((g) => ({ ...g, onClick: () => setGroup(g.groupId) }))} />
            ) : (
              <BarList
                hideAmounts={settings.hideAmounts}
                items={(drill ?? []).map((c) => ({
                  label: c.label,
                  ore: c.ore,
                  color: lookups.groups.get(group)?.color ?? '#94a3b8',
                  sub: `${c.count} transaksjoner · snitt per måned i grafen: ${new Intl.NumberFormat('nb-NO').format(Math.round(c.avg / 100))} kr`,
                  onClick: () => navigate(`/transaksjoner?kategori=${c.categoryId}&fra=${period.from}&til=${period.to}`),
                }))}
              />
            )}
          </Card>

          <Card>
            <SectionTitle>Topp butikker</SectionTitle>
            <BarList
              hideAmounts={settings.hideAmounts}
              items={data!.topMerchants.map((m) => ({
                label: m.name,
                ore: m.outOre,
                color: lookups.groups.get(lookups.categories.get(m.categoryId)?.groupId ?? '')?.color ?? '#94a3b8',
                sub: `${m.count} kjøp`,
                onClick: () => navigate(`/transaksjoner?q=${encodeURIComponent(m.name)}&fra=${period.from}&til=${period.to}`),
              }))}
            />
          </Card>

          <Card>
            <SectionTitle>Inntekt per kategori</SectionTitle>
            <BarList
              hideAmounts={settings.hideAmounts}
              items={s.categories
                .filter((c) => c.kind === 'income' && c.sumOre !== 0)
                .map((c) => ({ label: lookups.categories.get(c.categoryId)?.name ?? c.categoryId, ore: c.sumOre, color: '#16a34a' }))}
            />
          </Card>

          <Card>
            <SectionTitle>Sparing og investering</SectionTitle>
            <BarList
              hideAmounts={settings.hideAmounts}
              items={s.categories
                .filter((c) => c.kind === 'saving')
                .map((c) => ({
                  label: lookups.categories.get(c.categoryId)?.name ?? c.categoryId,
                  ore: -c.sumOre,
                  color: '#0d9488',
                  sub: `inn ${new Intl.NumberFormat('nb-NO').format(Math.round(c.inOre / 100))} kr · ut ${new Intl.NumberFormat('nb-NO').format(Math.round(c.outOre / 100))} kr`,
                }))}
            />
            {s.categories.filter((c) => c.kind === 'saving').length === 0 && <p className="text-sm text-slate-500">Ingen sparing i perioden.</p>}
          </Card>

          <Card>
            <SectionTitle>Faste mot variable utgifter</SectionTitle>
            <BarList
              hideAmounts={settings.hideAmounts}
              items={[
                { label: 'Faste', ore: data!.fixedVariable.fixedOre, color: '#4f46e5' },
                { label: 'Variable', ore: data!.fixedVariable.variableOre, color: '#ea580c' },
              ]}
            />
          </Card>

          <Card>
            <SectionTitle>Saldo over tid</SectionTitle>
            {data!.balance.length > 1 ? <BalanceLine points={data!.balance} /> : <p className="text-sm text-slate-500">Ingen saldohistorikk ennå.</p>}
          </Card>
        </>
      ) : null}
    </div>
  );
}
