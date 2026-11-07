import { guessDelimiter, parseCsvText } from './csv';
import { detectFormat } from './formats/registry';
import type { FormatProfile, ParsedFile } from './types';

export type ParseResult =
  | { ok: true; file: ParsedFile }
  | { ok: false; reason: 'empty' | 'unknown-format'; header: string[]; sample: string[][]; message: string };

/** Parses CSV text into canonical rows using the format registry. */
export function parseFileText(text: string, fileName: string, profiles: FormatProfile[] = []): ParseResult {
  const delimiter = guessDelimiter(text);
  const rows = parseCsvText(text, delimiter);
  if (rows.length === 0 || (rows.length === 1 && rows[0]!.every((f) => f.trim() === ''))) {
    return { ok: false, reason: 'empty', header: [], sample: [], message: 'Filen er tom.' };
  }
  const header = rows[0]!.map((h) => h.trim());
  const format = detectFormat(header, profiles);
  if (!format) {
    return {
      ok: false,
      reason: 'unknown-format',
      header,
      sample: rows.slice(1, 6),
      message: 'Ukjent filformat. Du kan sette opp et kolonnekart.',
    };
  }
  const output = format.toRawRows(rows);
  return {
    ok: true,
    file: {
      fileName,
      formatId: format.id,
      header,
      rows: output.rows,
      footer: output.footer,
      warnings: output.warnings,
    },
  };
}
