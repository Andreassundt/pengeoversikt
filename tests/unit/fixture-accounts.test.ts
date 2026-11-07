import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { FIXTURES } from './helpers';
import { normalizeAccountNumber } from '../../src/core/text';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const PATTERNS = [/\d{4} \d{2} \d{5}/g, /\(\d{11}\)/g, /(?<!\d)\d{11}(?!\d)/g, /\d{4}\.\d{2}\.\d{5}/g];

describe('fixtures contain only allowed account numbers', () => {
  const allowed = new Set(
    readFileSync(path.join(FIXTURES, 'tillatte-kontonumre.txt'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  );

  it('has an allow-list', () => {
    expect(allowed.size).toBeGreaterThan(0);
  });

  for (const file of walk(FIXTURES)) {
    if (file.endsWith('tillatte-kontonumre.txt')) continue;
    it(path.relative(FIXTURES, file), () => {
      const text = readFileSync(file, 'utf8');
      const found = new Set<string>();
      for (const re of PATTERNS) {
        for (const m of text.matchAll(re)) found.add(normalizeAccountNumber(m[0].replace(/[()]/g, '')));
      }
      const unknown = [...found].filter((n) => !allowed.has(n));
      expect(unknown, `ukjente kontonumre: ${unknown.join(', ')}`).toEqual([]);
    });
  }
});
