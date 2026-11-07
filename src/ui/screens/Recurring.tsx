import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups } from '../hooks';
import { formatDateShort } from '../../core/dates';
import { formatMinor } from '../../core/money';
import { Amount, Badge, Button, Card, CategoryDot, EmptyState, Spinner } from '../components/basics';
import type { RecurringGroup } from '../../core/types';

const INTERVAL_LABEL: Record<string, string> = { monthly: 'månedlig', weekly: 'ukentlig', yearly: 'årlig' };

export function Recurring() {
  const { engine, settings, updateSetting } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [showHidden, setShowHidden] = useState(false);
  const { data, loading } = useAsync(() => engine.recurring(), []);

  if (!lookups || (loading && !data)) return <Spinner />;
  const hidden = new Set(settings.hiddenRecurringKeys);
  const groups = (data ?? []).filter((g) => showHidden || !hidden.has(g.key));
  const visible = (data ?? []).filter((g) => !hidden.has(g.key));
  const monthly = visible.reduce((a, g) => a + (g.stopped ? 0 : g.monthlyOre), 0);

  const toggleHidden = (g: RecurringGroup) => {
    const next = hidden.has(g.key) ? settings.hiddenRecurringKeys.filter((k) => k !== g.key) : [...settings.hiddenRecurringKeys, g.key];
    void updateSetting('hiddenRecurringKeys', next);
  };

  if ((data ?? []).length === 0) {
    return <EmptyState icon="🔁" title="Ingen faste trekk ennå" text="Abonnementer og faste regninger dukker opp her når de gjenkjennes." />;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <div className="text-xs text-slate-500">Per måned</div>
          <div className="text-xl font-semibold">
            <Amount ore={monthly} decimals={0} />
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">Per år</div>
          <div className="text-xl font-semibold">
            <Amount ore={monthly * 12} decimals={0} />
          </div>
        </Card>
      </div>
      <ul className="space-y-2">
        {groups.map((g) => {
          const category = lookups.categories.get(g.categoryId);
          return (
            <li key={g.key}>
              <Card className="p-3">
                <div className="flex items-start gap-3">
                  <CategoryDot category={category} groups={lookups.groups} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate font-medium">{g.name}</div>
                      <div className="text-right">
                        <Amount ore={g.amountOre} className="font-semibold" />
                        {g.currency !== 'NOK' && <div className="amount text-xs text-slate-500">{formatMinor(g.amountMinor, g.currency)}</div>}
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">
                      {category?.name} · {g.interval ? INTERVAL_LABEL[g.interval] : 'intervall ukjent'} · {g.count} trekk
                    </div>
                    <div className="text-sm text-slate-500">
                      Sist {formatDateShort(g.lastDate)}
                      {g.nextDate && !g.stopped && ` · neste ca. ${formatDateShort(g.nextDate)}`}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.isNew && <Badge tone="info">Ny</Badge>}
                      {g.priceChange && <Badge tone="warn">Prisendring</Badge>}
                      {g.possibleDouble && <Badge tone="bad">Mulig dobbelttrekk</Badge>}
                      {g.stopped && <Badge tone="neutral">Stoppet?</Badge>}
                      {hidden.has(g.key) && <Badge tone="neutral">Skjult</Badge>}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/transaksjoner?q=${encodeURIComponent(g.name)}`)}>
                        Vis trekk
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleHidden(g)}>
                        {hidden.has(g.key) ? 'Vis' : 'Skjul'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {hidden.size > 0 && (
        <Button variant="ghost" full onClick={() => setShowHidden(!showHidden)}>
          {showHidden ? 'Skjul skjulte' : `Vis ${hidden.size} skjulte`}
        </Button>
      )}
    </div>
  );
}
