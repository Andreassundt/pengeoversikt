import { addMonths, formatMonth } from '../../core/dates';

export function MonthNav({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  const atMax = max != null && month >= max;
  return (
    <div className="flex items-center justify-between py-1">
      <button
        type="button"
        onClick={() => onChange(addMonths(month, -1))}
        aria-label="Forrige måned"
        className="flex h-11 w-11 items-center justify-center rounded-full text-2xl hover:bg-slate-200 dark:hover:bg-slate-800"
      >
        ‹
      </button>
      <h2 className="text-lg font-semibold capitalize" data-testid="month-title">
        {formatMonth(month)}
      </h2>
      <button
        type="button"
        onClick={() => onChange(addMonths(month, 1))}
        aria-label="Neste måned"
        disabled={atMax}
        className="flex h-11 w-11 items-center justify-center rounded-full text-2xl hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-800"
      >
        ›
      </button>
    </div>
  );
}
