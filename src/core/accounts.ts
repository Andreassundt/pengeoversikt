import { RAW, type RawRow } from './types';
import { parseAmountDot } from './money';
import { fixSevenBit, fold, normalizeAccountNumber } from './text';

export const OWN_TRANSFER_SUBTYPE = 'OVERFOERING TIL EGEN KONTO';

export function rowAmountOre(fields: string[]): number {
  return (parseAmountDot(fields[RAW.amountIn]) ?? 0) + (parseAmountDot(fields[RAW.amountOut]) ?? 0);
}

export interface AccountDetection {
  number: string | null;
  /** Candidate account numbers with how many rows pointed at them. */
  candidates: Map<string, number>;
  warning: string | null;
}

/**
 * Finds the account a file belongs to: "Til konto" for rows with a positive amount and
 * "Fra konto" for rows with a negative amount. It must be the same on all rows.
 */
export function detectAccountNumber(rows: RawRow[]): AccountDetection {
  const candidates = new Map<string, number>();
  for (const row of rows) {
    const amount = rowAmountOre(row.fields);
    if (amount === 0) continue;
    const raw = amount > 0 ? row.fields[RAW.toAccount] : row.fields[RAW.fromAccount];
    const number = normalizeAccountNumber(raw);
    if (!number) continue;
    candidates.set(number, (candidates.get(number) ?? 0) + 1);
  }
  if (candidates.size === 0) return { number: null, candidates, warning: null };
  let best: string | null = null;
  let bestCount = -1;
  for (const [number, count] of candidates) {
    if (count > bestCount) {
      best = number;
      bestCount = count;
    }
  }
  let warning: string | null = null;
  if (candidates.size > 1) {
    const total = [...candidates.values()].reduce((a, b) => a + b, 0);
    warning = `Filen peker på ${candidates.size} ulike kontonumre. ${bestCount} av ${total} rader peker på ${best}.`;
  }
  return { number: best, candidates, warning };
}

/**
 * Collects account names from "Overføring til egen konto" rows: Avsender is the name of the
 * from-account and Mottakernavn the name of the to-account.
 */
export function collectAccountNames(rows: RawRow[], into: Map<string, string> = new Map()): Map<string, string> {
  for (const row of rows) {
    if (fold(row.fields[RAW.subtype] ?? '') !== OWN_TRANSFER_SUBTYPE) continue;
    const from = normalizeAccountNumber(row.fields[RAW.fromAccount]);
    const fromName = (row.fields[RAW.senderName] ?? '').trim();
    const to = normalizeAccountNumber(row.fields[RAW.toAccount]);
    const toName = (row.fields[RAW.receiverName] ?? '').trim();
    if (from && fromName && !into.has(from)) into.set(from, fromName);
    if (to && toName && !into.has(to)) into.set(to, toName);
  }
  return into;
}

export interface OwnerDetection {
  name: string | null;
  nameFolded: string | null;
  confirmed: boolean;
}

/**
 * The owner is the most common Avsender on booked card purchases, confirmed by
 * Mottakernavn on incoming payments. Falls back to the most common Mottakernavn on incoming rows.
 */
export function detectOwner(rows: RawRow[]): OwnerDetection {
  const counts = new Map<string, { count: number; variants: Map<string, number> }>();
  const bump = (name: string): void => {
    const fixed = fixSevenBit(name.trim());
    const key = fold(fixed);
    if (!key) return;
    const entry = counts.get(key) ?? { count: 0, variants: new Map<string, number>() };
    entry.count++;
    entry.variants.set(fixed, (entry.variants.get(fixed) ?? 0) + 1);
    counts.set(key, entry);
  };
  for (const row of rows) {
    const f = row.fields;
    const isCard = fold(f[RAW.type] ?? '') === 'VAREKJOEP';
    const booked = fold(f[RAW.status] ?? '') !== 'RESERVERT';
    if (isCard && booked && f[RAW.senderName]) bump(f[RAW.senderName]!);
  }
  let usedFallback = false;
  if (counts.size === 0) {
    usedFallback = true;
    for (const row of rows) {
      const f = row.fields;
      if (rowAmountOre(f) > 0 && fold(f[RAW.subtype] ?? '') !== OWN_TRANSFER_SUBTYPE && f[RAW.receiverName]) {
        bump(f[RAW.receiverName]!);
      }
    }
  }
  if (counts.size === 0) return { name: null, nameFolded: null, confirmed: false };
  let bestKey = '';
  let best: { count: number; variants: Map<string, number> } | null = null;
  for (const [key, entry] of counts) {
    if (!best || entry.count > best.count) {
      best = entry;
      bestKey = key;
    }
  }
  let variant = '';
  let variantCount = -1;
  for (const [v, c] of best!.variants) {
    if (c > variantCount) {
      variant = v;
      variantCount = c;
    }
  }
  let confirmed = usedFallback;
  if (!usedFallback) {
    for (const row of rows) {
      const f = row.fields;
      if (rowAmountOre(f) > 0 && fold(fixSevenBit(f[RAW.receiverName] ?? '')) === bestKey) {
        confirmed = true;
        break;
      }
    }
  }
  return { name: variant, nameFolded: bestKey, confirmed };
}
