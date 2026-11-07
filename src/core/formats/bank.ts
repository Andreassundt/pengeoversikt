import { RAW_FIELD_COUNT, type Footer, type RawRow } from '../types';
import { fold } from '../text';
import { parseAmountNo } from '../money';
import { findNoDate } from '../dates';
import type { FileFormat, FormatOutput } from './types';

export const BANK_HEADER = [
  'Utført dato',
  'Bokført dato',
  'Rentedato',
  'Beskrivelse',
  'Type',
  'Undertype',
  'Fra konto',
  'Avsender',
  'Til konto',
  'Mottakernavn',
  'Beløp inn',
  'Beløp ut',
  'Valuta',
  'Status',
  'Melding/KID/Fakt.nr',
];

export function isEmptyRow(fields: string[]): boolean {
  return fields.every((f) => f.trim() === '');
}

function normalizeField(s: string): string {
  return s.replace(/\r\n?/g, '\n').trim();
}

/** Parses the footer lines (after the first empty row). Amounts use comma decimals and NBSP thousands. */
export function parseFooter(lines: string[][]): Footer | null {
  const footer: Footer = {
    totalInOre: null,
    totalOutOre: null,
    openingBalanceOre: null,
    closingBalanceOre: null,
    periodStart: null,
    periodEnd: null,
  };
  let found = false;
  for (const line of lines) {
    const label = fold(line[0] ?? '');
    if (!label) continue;
    const amountField = (line[2] ?? line[1] ?? '').trim();
    const amount = parseAmountNo(amountField);
    if (label.startsWith('TOTAL') && label.includes('INN')) {
      footer.totalInOre = amount;
      found = true;
    } else if (label.startsWith('TOTAL') && /\bUT\b/.test(label)) {
      footer.totalOutOre = amount;
      found = true;
    } else if (label.startsWith('INNGAAENDE SALDO')) {
      footer.openingBalanceOre = amount;
      footer.periodStart = findNoDate(line[0] ?? '');
      found = true;
    } else if (label.startsWith('UTGAAENDE SALDO')) {
      footer.closingBalanceOre = amount;
      footer.periodEnd = findNoDate(line[0] ?? '');
      found = true;
    }
  }
  return found ? footer : null;
}

export const bankFormat: FileFormat = {
  id: 'bank-no-v1',
  name: 'Nettbank – transaksjonsliste',
  matches(header: string[]): boolean {
    if (header.length !== RAW_FIELD_COUNT) return false;
    return header.every((h, i) => fold(h) === fold(BANK_HEADER[i]!));
  },
  toRawRows(rows: string[][]): FormatOutput {
    const out: RawRow[] = [];
    const warnings: string[] = [];
    let i = 1;
    for (; i < rows.length; i++) {
      const r = rows[i]!;
      if (isEmptyRow(r)) break;
      if (r.length !== RAW_FIELD_COUNT) {
        warnings.push(`Rad ${i} har ${r.length} felt, forventet ${RAW_FIELD_COUNT}.`);
      }
      const fields: string[] = [];
      for (let k = 0; k < RAW_FIELD_COUNT; k++) fields.push(normalizeField(r[k] ?? ''));
      out.push({ fields, rowNumber: out.length + 1 });
    }
    const footer = parseFooter(rows.slice(i + 1));
    if (!footer) warnings.push('Fant ingen bunntekst med summer og saldo.');
    return { rows: out, footer, warnings };
  },
};
