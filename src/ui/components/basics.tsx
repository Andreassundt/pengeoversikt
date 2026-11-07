import { useEffect, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { formatOre } from '../../core/money';
import { cn } from '../data';
import type { Category, CategoryGroup } from '../../core/types';

export interface AmountProps {
  ore: number;
  colored?: boolean;
  plus?: boolean;
  decimals?: 0 | 2;
  unit?: boolean;
  className?: string;
}

/** Formatted amount with tabular figures. Gets blurred by the privacy mode. */
export function Amount({ ore, colored = false, plus = false, decimals = 2, unit = true, className }: AmountProps) {
  const color = colored ? (ore < 0 ? 'text-rose-600 dark:text-rose-400' : ore > 0 ? 'text-emerald-700 dark:text-emerald-400' : '') : '';
  return <span className={cn('amount whitespace-nowrap tabular-nums', color, className)}>{formatOre(ore, { decimals, unit, plus })}</span>;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
  size?: 'md' | 'lg' | 'sm';
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-800 disabled:bg-slate-400',
  secondary:
    'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 disabled:opacity-50',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 dark:text-brand-500 dark:hover:bg-slate-800 disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50',
};

export function Button({ variant = 'primary', full, size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        size === 'lg' ? 'min-h-14 px-6 text-lg' : size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4',
        VARIANTS[variant],
        full && 'w-full',
        className,
      )}
      {...rest}
    />
  );
}

export function Card({ children, className, onClick, testId }: { children: ReactNode; className?: string; onClick?: () => void; testId?: string }) {
  const base = 'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800';
  if (onClick) {
    return (
      <button type="button" data-testid={testId} onClick={onClick} className={cn(base, 'w-full text-left', className)}>
        {children}
      </button>
    );
  }
  return (
    <section data-testid={testId} className={cn(base, className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>
      {action}
    </div>
  );
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Full height sheet (for long content). */
  tall?: boolean;
}

/** Bottom sheet for details and choices. */
export function Sheet({ open, onClose, title, children, tall }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex w-full max-w-md flex-col rounded-t-3xl bg-white shadow-xl dark:bg-slate-900 sm:rounded-3xl',
          tall ? 'h-[92dvh]' : 'max-h-[92dvh]',
        )}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="text-5xl" aria-hidden="true">
        {icon}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {text && <p className="max-w-xs text-slate-600 dark:text-slate-400">{text}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = 'Laster…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-8 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function PageHeader({ title, back, right }: { title: string; back?: () => void; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-slate-200/70 bg-slate-50/95 px-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      {back && (
        <button type="button" onClick={back} aria-label="Tilbake" className="flex h-11 w-11 items-center justify-center rounded-full text-2xl">
          ‹
        </button>
      )}
      <h1 className={cn('flex-1 text-xl font-semibold', !back && 'px-2')}>{title}</h1>
      {right}
    </header>
  );
}

export function CategoryDot({ category, groups, size = 'md' }: { category: Category | undefined; groups: Map<string, CategoryGroup>; size?: 'sm' | 'md' }) {
  const color = category ? (category.color ?? groups.get(category.groupId)?.color ?? '#94a3b8') : '#94a3b8';
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full', size === 'md' ? 'h-10 w-10 text-lg' : 'h-6 w-6 text-xs')}
      style={{ backgroundColor: `${color}22`, color }}
    >
      {category?.icon ?? '•'}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'good' | 'bad' | 'info' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    bad: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  };
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span>{label}</span>
      <span className={cn('relative inline-block h-7 w-12 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700')}>
        <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block py-2">
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

export function daysAgoText(iso: string | null): string {
  if (!iso) return 'aldri';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'i dag';
  if (days === 1) return 'i går';
  return `for ${days} dager siden`;
}
