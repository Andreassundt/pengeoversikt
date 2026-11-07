import { CAT } from './categories';
import type { Direction } from './types';
import { normalizeForKeywords } from './text';

/**
 * Message keywords (section 7.2), in priority order. "in" is the category when I receive money
 * ("refusjon" = same expense category with a positive amount).
 */
export interface KeywordRow {
  words: string[];
  out: string | null;
  in: string | null;
}

export const KEYWORDS: KeywordRow[] = [
  { words: ['husleie'], out: CAT.husleie, in: CAT.leieinntekt },
  { words: ['felleskost'], out: CAT.felleskostnader, in: CAT.felleskostnader },
  { words: ['strøm', 'nettleie'], out: CAT.strom, in: CAT.strom },
  { words: ['forsikring'], out: CAT.forsikring, in: CAT.forsikring },
  { words: ['sushi', 'pizza', 'risbolle', 'burger', 'kebab', 'restaurant', 'lunsj'], out: CAT.matUte, in: CAT.matUte },
  { words: ['mat*', 'food', 'middag', 'dagligvar'], out: CAT.dagligvarer, in: CAT.dagligvarer },
  { words: ['kino', 'konsert', 'billett'], out: CAT.kultur, in: CAT.kultur },
  { words: ['bøter', 'botkasse', 'kontingent', 'trening', 'lisens'], out: CAT.sport, in: CAT.sport },
  { words: ['bremser', 'verksted', 'dekk', 'bil'], out: CAT.bil, in: CAT.bil },
  { words: ['klær', 'tskjorte', 't-skjorte', 'sko', 'jakke'], out: CAT.klaer, in: CAT.klaer },
  { words: ['håndkle', 'tannkrem', 'dekor', 'møbel'], out: CAT.mobler, in: CAT.mobler },
  { words: ['gave', 'julegave', 'bursdag', 'arv'], out: CAT.gaverGitt, in: CAT.gaverArv },
  { words: ['budsjett'], out: CAT.deltHusholdning, in: CAT.deltHusholdning },
  { words: ['finnkode'], out: null, in: CAT.salg },
  { words: ['reise', 'fly', 'hotell'], out: CAT.reise, in: CAT.reise },
];

interface CompiledRow {
  row: KeywordRow;
  res: RegExp[];
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalised length ≥ 5: anywhere. Length ≤ 4: whole word only. "word*": at word start.
 * Word characters are letters only, so "FINKODE:" still matches.
 */
export function compileKeyword(word: string): RegExp {
  const prefix = word.endsWith('*');
  const base = normalizeForKeywords(prefix ? word.slice(0, -1) : word);
  const e = escape(base);
  if (prefix) return new RegExp(`(?<![A-Z])${e}`);
  if (base.length >= 5) return new RegExp(e);
  return new RegExp(`(?<![A-Z])${e}(?![A-Z])`);
}

const COMPILED: CompiledRow[] = KEYWORDS.map((row) => ({ row, res: row.words.map(compileKeyword) }));

export interface KeywordMatch {
  categoryId: string;
  /** More than one category matched; the first in the table was chosen. */
  ambiguous: boolean;
  matched: string[];
}

export function matchKeywords(message: string, direction: Direction): KeywordMatch | null {
  if (!message) return null;
  const text = normalizeForKeywords(message);
  if (!text) return null;
  const hits: Array<{ categoryId: string; word: string }> = [];
  for (const { row, res } of COMPILED) {
    const categoryId = direction === 'out' ? row.out : row.in;
    if (!categoryId) continue;
    for (let i = 0; i < res.length; i++) {
      if (res[i]!.test(text)) {
        hits.push({ categoryId, word: row.words[i]! });
        break;
      }
    }
  }
  if (hits.length === 0) return null;
  const distinct = new Set(hits.map((h) => h.categoryId));
  return { categoryId: hits[0]!.categoryId, ambiguous: distinct.size > 1, matched: hits.map((h) => h.word) };
}
