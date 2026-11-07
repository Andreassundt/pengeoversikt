import { useMemo } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import type { BalancePoint, MonthPoint } from '../../core/aggregate';
import type { CategoryGroup } from '../../core/types';
import { formatMonthShort } from '../../core/dates';
import { formatOre } from '../../core/money';
import { Amount } from './basics';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);

function isDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function axisColors() {
  const dark = isDark();
  return { grid: dark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.15)', tick: dark ? '#cbd5e1' : '#475569' };
}

const kr = (v: number) => formatOre(Math.round(v * 100), { decimals: 0, unit: true });

/** Horizontal bars for category/group totals (used instead of pie charts). */
export function BarList({
  items,
  hideAmounts,
}: {
  items: Array<{ label: string; ore: number; color: string; onClick?: () => void; sub?: string }>;
  hideAmounts?: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.ore)));
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const inner = (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="truncate font-medium">{item.label}</span>
              <Amount ore={item.ore} decimals={0} className="ml-2" />
            </div>
            {item.sub && <div className="text-xs text-slate-500">{item.sub}</div>}
            <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
              <div
                className="h-2.5 rounded-full"
                style={{ width: `${Math.max(2, (Math.abs(item.ore) / max) * 100)}%`, backgroundColor: item.color, opacity: hideAmounts ? 0.3 : 1 }}
              />
            </div>
          </>
        );
        return (
          <li key={item.label}>
            {item.onClick ? (
              <button type="button" onClick={item.onClick} className="block w-full text-left">
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Stacked monthly bars per group. */
export function StackedMonths({
  series,
  groups,
  normal,
  onMonth,
}: {
  series: MonthPoint[];
  groups: Map<string, CategoryGroup>;
  normal: boolean;
  onMonth?: (month: string) => void;
}) {
  const data = useMemo(() => {
    const groupIds = new Set<string>();
    for (const p of series) for (const id of Object.keys(normal ? p.groupsNormalOre : p.groupsOre)) groupIds.add(id);
    const ordered = [...groupIds].sort((a, b) => (groups.get(a)?.order ?? 99) - (groups.get(b)?.order ?? 99));
    return {
      labels: series.map((p) => formatMonthShort(p.month)),
      datasets: ordered.map((id) => ({
        label: groups.get(id)?.name ?? id,
        data: series.map((p) => ((normal ? p.groupsNormalOre : p.groupsOre)[id] ?? 0) / 100),
        backgroundColor: groups.get(id)?.color ?? '#94a3b8',
        borderRadius: 3,
      })),
    };
  }, [series, groups, normal]);
  const colors = axisColors();
  return (
    <div className="h-64">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          onClick: (_e, elements) => {
            const el = elements[0];
            if (el && onMonth) onMonth(series[el.index]!.month);
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${kr(c.parsed.y ?? 0)}` } },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: colors.tick } },
            y: { stacked: true, grid: { color: colors.grid }, ticks: { color: colors.tick, callback: (v) => kr(Number(v)) } },
          },
        }}
      />
    </div>
  );
}

export function BalanceLine({ points }: { points: BalancePoint[] }) {
  const colors = axisColors();
  const step = Math.max(1, Math.floor(points.length / 60));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const data = {
    labels: sampled.map((p) => p.date.slice(5)),
    datasets: [
      {
        label: 'Saldo',
        data: sampled.map((p) => p.balanceOre / 100),
        borderColor: '#0f766e',
        backgroundColor: 'rgba(15,118,110,0.15)',
        fill: true,
        pointRadius: 0,
        tension: 0.2,
      },
    ],
  };
  return (
    <div className="h-48">
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => kr(c.parsed.y ?? 0) } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: colors.tick, maxTicksLimit: 6 } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.tick, callback: (v) => kr(Number(v)) } },
          },
        }}
      />
    </div>
  );
}

export function IncomeExpenseBars({ series }: { series: MonthPoint[] }) {
  const colors = axisColors();
  const data = {
    labels: series.map((p) => formatMonthShort(p.month)),
    datasets: [
      { label: 'Inn', data: series.map((p) => p.incomeOre / 100), backgroundColor: '#16a34a', borderRadius: 3 },
      { label: 'Ut (normalt)', data: series.map((p) => p.expenseNormalOre / 100), backgroundColor: '#ea580c', borderRadius: 3 },
      { label: 'Sparing', data: series.map((p) => p.savingOre / 100), backgroundColor: '#0d9488', borderRadius: 3 },
    ],
  };
  return (
    <div className="h-56">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.tick } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${kr(c.parsed.y ?? 0)}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: colors.tick } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.tick, callback: (v) => kr(Number(v)) } },
          },
        }}
      />
    </div>
  );
}
