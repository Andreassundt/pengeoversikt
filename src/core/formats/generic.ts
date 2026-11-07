import { RAW, RAW_FIELD_COUNT, type FormatProfile, type RawRow } from '../types';
import { fold } from '../text';
import { parseAmountDot, parseAmountNo } from '../money';
import { parseAnyDate, formatDateNo } from '../dates';
import { isEmptyRow } from './bank';
import type { FileFormat, FormatOutput } from './types';

/** A stable signature for a header row, used to look up saved column-mapping profiles. */
export function headerSignature(header: string[]): string {
  return header.map((h) => fold(h)).join(';');
}

function oreToDot(ore: number): string {
  const abs = Math.abs(ore);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const fracText = frac === 0 ? '' : frac % 10 === 0 ? `.${frac / 10}` : `.${frac < 10 ? '0' : ''}${frac}`;
  return `${ore < 0 ? '-' : ''}${whole}${fracText}`;
}

/**
 * Builds a format from a user-defined column mapping. Rows are converted to the canonical
 * 15-field layout so the rest of the pipeline is format-agnostic.
 */
export function createGenericFormat(profile: FormatProfile): FileFormat {
  const m = profile.mapping;
  const parseAmount = (s: string | undefined): number | null =>
    m.decimal === ',' ? parseAmountNo(s) : parseAmountDot((s ?? '').replace(/[\s ]/g, ''));
  return {
    id: `profile:${profile.signature}`,
    name: profile.name,
    matches(header: string[]): boolean {
      return headerSignature(header) === profile.signature;
    },
    toRawRows(rows: string[][]): FormatOutput {
      const out: RawRow[] = [];
      const warnings: string[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]!;
        if (isEmptyRow(r)) break;
        const date = parseAnyDate(r[m.date]);
        if (!date) {
          warnings.push(`Rad ${i}: ukjent datoformat «${r[m.date] ?? ''}».`);
          continue;
        }
        let amount: number | null = null;
        if (m.amount != null) {
          amount = parseAmount(r[m.amount]);
        } else {
          const inn = m.amountIn != null ? parseAmount(r[m.amountIn]) : null;
          const ut = m.amountOut != null ? parseAmount(r[m.amountOut]) : null;
          if (inn == null && ut == null) amount = null;
          else amount = (inn ?? 0) - Math.abs(ut ?? 0);
        }
        if (amount == null) {
          warnings.push(`Rad ${i}: fant ikke beløp.`);
          continue;
        }
        const fields: string[] = new Array<string>(RAW_FIELD_COUNT).fill('');
        const dateNo = formatDateNo(date);
        fields[RAW.executedDate] = dateNo;
        fields[RAW.bookedDate] = dateNo;
        fields[RAW.interestDate] = dateNo;
        fields[RAW.description] = (r[m.text] ?? '').trim();
        fields[RAW.message] = m.message != null ? (r[m.message] ?? '').trim() : '';
        fields[RAW.currency] = 'NOK';
        fields[RAW.status] = 'Bokført';
        const cpAccount = m.counterpartyAccount != null ? (r[m.counterpartyAccount] ?? '').trim() : '';
        const cpName = m.counterpartyName != null ? (r[m.counterpartyName] ?? '').trim() : '';
        if (amount >= 0) {
          fields[RAW.amountIn] = oreToDot(amount);
          fields[RAW.fromAccount] = cpAccount;
          fields[RAW.senderName] = cpName;
        } else {
          fields[RAW.amountOut] = oreToDot(amount);
          fields[RAW.toAccount] = cpAccount;
          fields[RAW.receiverName] = cpName;
        }
        out.push({ fields, rowNumber: out.length + 1 });
      }
      return { rows: out, footer: null, warnings };
    },
  };
}
