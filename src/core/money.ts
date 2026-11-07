/**
 * Money is always handled as integer øre (minor units). No floating point arithmetic on amounts.
 */

const DOT_RE = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;
const NO_RE = /^([+-]?)(\d+)(?:,(\d{1,2}))?$/;

function toOre(sign: string, whole: string, frac: string | undefined): number {
  const f = (frac ?? '').padEnd(2, '0');
  const ore = Number.parseInt(whole, 10) * 100 + Number.parseInt(f, 10);
  return sign === '-' ? -ore : ore;
}

/** Parses the row format: dot as decimal separator, minimal decimals ("1500", "-53.5", "8968.79"). */
export function parseAmountDot(s: string | undefined | null): number | null {
  if (s == null) return null;
  const t = s.replace(/[\s  ]/g, '');
  if (t === '') return null;
  const m = DOT_RE.exec(t);
  if (!m) return null;
  return toOre(m[1]!, m[2]!, m[3]);
}

/**
 * Parses Norwegian formatting: comma as decimal, space/NBSP or dot as thousands separator,
 * optional "kr"/"NOK" ("1 250 200,00 NOK", "kr 4.972,00", "-40 500,00").
 */
export function parseAmountNo(s: string | undefined | null): number | null {
  if (s == null) return null;
  let t = s.replace(/NOK|kr\.?/gi, '');
  t = t.replace(/[\s  ]/g, '');
  t = t.replace(/\./g, '');
  if (t === '') return null;
  const m = NO_RE.exec(t);
  if (!m) return null;
  return toOre(m[1]!, m[2]!, m[3]);
}

const nf2 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export interface FormatOptions {
  decimals?: 0 | 2;
  /** Append " kr". */
  unit?: boolean;
  /** Always show a sign for positive numbers. */
  plus?: boolean;
}

/**
 * Formats øre as "1 234,50" (optionally with " kr"). Negative numbers get a real minus sign.
 * The thousands separator is whatever Intl gives for nb-NO (a non-breaking space).
 */
export function formatOre(ore: number, opts: FormatOptions = {}): string {
  const decimals = opts.decimals ?? 2;
  const abs = Math.abs(ore);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  let text: string;
  if (decimals === 2) {
    // Format the whole part and the fraction separately so no float rounding is involved.
    text = `${nf0.format(whole)},${frac < 10 ? '0' : ''}${frac}`;
  } else {
    text = nf0.format(Math.round(abs / 100));
  }
  const isNegative = ore < 0 && (decimals === 2 ? abs > 0 : Math.round(abs / 100) > 0);
  if (isNegative) text = '−' + text;
  else if (opts.plus && ore > 0) text = '+' + text;
  return opts.unit ? `${text} kr` : text;
}

/** Keeps the Intl formatter referenced so nb-NO formatting rules stay in one place. */
export function formatNumber(n: number): string {
  return nf2.format(n);
}

/** Formats an amount in another currency's minor units, e.g. "SEK 535,23". */
export function formatMinor(minor: number, currency: string): string {
  return `${currency} ${formatOre(minor)}`;
}

export function sumOre(values: Iterable<number>): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

/** Percent of a over b as integer basis points difference, without floats: returns |a-b|*10000/b. */
export function diffPermyriad(a: number, b: number): number {
  if (b === 0) return a === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.round((Math.abs(a - b) * 10_000) / Math.abs(b));
}
