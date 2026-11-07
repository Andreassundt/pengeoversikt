import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFileText } from '../../src/core/parse';
import type { ParsedFile } from '../../src/core/types';
import { parseCsvText } from '../../src/core/csv';

export const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

export const EXPORT1_FILES = [
  'eksport-1/Transaksjonsliste-07-11-25-07-11-26.csv',
  'eksport-1/Transaksjonsliste-07-11-25-07-11-26_1.csv',
  'eksport-1/Transaksjonsliste-07-11-25-07-11-26_2.csv',
  'eksport-1/Transaksjonsliste-07-11-25-07-11-26_3.csv',
  'eksport-1/Transaksjonsliste-07-11-25-07-11-26_4.csv',
];
export const EXPORT2_FILE = 'eksport-2/Transaksjonsliste-12-10-26-10-11-26.csv';

export function readFixture(rel: string): string {
  return readFileSync(path.join(FIXTURES, rel), 'utf8');
}

export function parseFixture(rel: string): ParsedFile {
  const res = parseFileText(readFixture(rel), path.basename(rel));
  if (!res.ok) throw new Error(`${rel}: ${res.message}`);
  return res.file;
}

export interface FasitRow {
  fil: string;
  rad: number;
  konto: string;
  utfort: string;
  beskrivelse: string;
  belop: string;
  kategori: string;
  uten_oppsett: string;
  flagg: string[];
  navn: string;
  ny_ved_reimport: string;
}

export function readFasit(): FasitRow[] {
  const rows = parseCsvText(readFixture('fasit.csv'));
  const header = rows[0]!;
  const idx = (name: string): number => header.indexOf(name);
  return rows.slice(1).map((r) => ({
    fil: r[idx('fil')] ?? '',
    rad: Number(r[idx('rad')]),
    konto: r[idx('konto')] ?? '',
    utfort: r[idx('utfort')] ?? '',
    beskrivelse: r[idx('beskrivelse')] ?? '',
    belop: r[idx('belop')] ?? '',
    kategori: r[idx('kategori')] ?? '',
    uten_oppsett: r[idx('uten_oppsett')] ?? '',
    flagg: (r[idx('flagg')] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    navn: r[idx('navn')] ?? '',
    ny_ved_reimport: r[idx('ny_ved_reimport')] ?? '',
  }));
}

/** Replaces NBSP and narrow NBSP with ordinary spaces for assertions. */
export function plain(s: string): string {
  return s.replace(/[  ]/g, ' ');
}
