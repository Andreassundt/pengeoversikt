/** Dates are ISO strings (yyyy-mm-dd) so they can be compared lexicographically. */

const NO_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const DAY_MONTH_RE = /^(\d{2})\.(\d{2})$/;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isValid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

/** "06.11.2026" → "2026-11-06". */
export function parseNoDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const m = NO_DATE_RE.exec(s.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!isValid(y, mo, d)) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** Accepts dd.mm.yyyy, yyyy-mm-dd and dd/mm/yyyy. */
export function parseAnyDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    return isValid(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  }
  const slash = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (slash) {
    const d = Number(slash[1]);
    const mo = Number(slash[2]);
    const y = Number(slash[3]);
    return isValid(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  }
  return null;
}

/** Extracts the first dd.mm.yyyy found in a string. */
export function findNoDate(s: string): string | null {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  return m ? parseNoDate(m[0]) : null;
}

/**
 * Resolves a "dd.mm" purchase date using the year of the executed date.
 * If the result would be later than the executed date, one year is subtracted.
 */
export function resolvePurchaseDate(dayMonth: string, executedIso: string): string | null {
  const m = DAY_MONTH_RE.exec(dayMonth.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(executedIso.slice(0, 4));
  if (!Number.isFinite(y)) return null;
  if (!isValid(y, mo, d)) {
    if (!isValid(y - 1, mo, d)) return null;
    y -= 1;
  }
  let iso = `${y}-${pad2(mo)}-${pad2(d)}`;
  if (iso > executedIso) {
    y -= 1;
    if (!isValid(y, mo, d)) return null;
    iso = `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  return iso;
}

export function isoToUtc(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Date.UTC(y, m - 1, d);
}

export function utcToIso(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function addDays(iso: string, days: number): string {
  return utcToIso(isoToUtc(iso) + days * 86_400_000);
}

/** b − a in whole days. */
export function daysBetween(a: string, b: string): number {
  return Math.round((isoToUtc(b) - isoToUtc(a)) / 86_400_000);
}

/** "2026-10-31" → "2026-10". */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${pad2(dim)}`;
}

export function addMonths(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return `${ny}-${pad2(nm + 1)}`;
}

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

const MONTHS_SHORT = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const MONTHS_LONG = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
];

/** "2026-11-06" → "6. nov." */
export function formatDateShort(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7));
  return `${d}. ${MONTHS_SHORT[m - 1] ?? ''}`;
}

/** "2026-11-06" → "6. november 2026" */
export function formatDateLong(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7));
  return `${d}. ${MONTHS_LONG[m - 1] ?? ''} ${iso.slice(0, 4)}`;
}

/** "2026-11-06" → "06.11.2026" */
export function formatDateNo(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** "2026-10" → "oktober 2026" */
export function formatMonth(month: string): string {
  const m = Number(month.slice(5, 7));
  return `${MONTHS_LONG[m - 1] ?? ''} ${month.slice(0, 4)}`;
}

/** "2026-10" → "okt. 26" */
export function formatMonthShort(month: string): string {
  const m = Number(month.slice(5, 7));
  return `${MONTHS_SHORT[m - 1] ?? ''} ${month.slice(2, 4)}`;
}

export function weekdayName(iso: string): string {
  const names = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  return names[new Date(isoToUtc(iso)).getUTCDay()] ?? '';
}

/** Median of a list of numbers (integer-safe: returns the lower middle for even counts). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2);
}
