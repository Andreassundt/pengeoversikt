import Papa from 'papaparse';

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Decodes bytes as UTF-8, falling back to Windows-1252 when the bytes are not valid UTF-8. */
export function decodeCsvBytes(buf: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Splits a CSV text into rows of fields. Handles quoted fields with embedded line breaks. */
export function parseCsvText(text: string, delimiter = ';'): string[][] {
  const result = Papa.parse<string[]>(stripBom(text), {
    delimiter,
    quoteChar: '"',
    escapeChar: '"',
    skipEmptyLines: false,
  });
  const rows = result.data.map((r) => r.map((f) => (f == null ? '' : String(f))));
  // PapaParse yields a final [""] row when the file ends with a newline.
  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0] === '') rows.pop();
    else break;
  }
  return rows;
}

/** Guesses the delimiter from the header line. */
export function guessDelimiter(text: string): string {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? '';
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestCount = -1;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}
