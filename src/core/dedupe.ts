const SEP = '\u001f';

/** Dedupe key: account number + all 15 raw fields. Identical rows get identical keys on purpose. */
export function dedupeKey(accountNumber: string, fields: string[]): string {
  return accountNumber + SEP + fields.join(SEP);
}

/** Counts occurrences per key. */
export function countKeys(keys: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}
