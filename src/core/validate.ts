import type { Footer, RawRow } from './types';
import { rowAmountOre } from './accounts';
import { formatOre } from './money';

export interface ValidationResult {
  sumInOre: number;
  sumOutOre: number;
  warnings: string[];
}

/**
 * Compares the rows with the footer: total in/out, and opening + net = closing.
 * Deviations are warnings, never errors (the bank sometimes leaves out rows that are in the balance).
 */
export function validateAgainstFooter(rows: RawRow[], footer: Footer | null): ValidationResult {
  let sumIn = 0;
  let sumOut = 0;
  for (const row of rows) {
    const a = rowAmountOre(row.fields);
    if (a > 0) sumIn += a;
    else sumOut += a;
  }
  const warnings: string[] = [];
  if (!footer) return { sumInOre: sumIn, sumOutOre: sumOut, warnings };
  if (footer.totalInOre != null && footer.totalInOre !== sumIn) {
    warnings.push(
      `Sum inn i radene (${formatOre(sumIn, { unit: true })}) avviker fra bunnteksten (${formatOre(footer.totalInOre, { unit: true })}) med ${formatOre(Math.abs(sumIn - footer.totalInOre), { unit: true })}.`,
    );
  }
  if (footer.totalOutOre != null && footer.totalOutOre !== sumOut) {
    warnings.push(
      `Sum ut i radene (${formatOre(sumOut, { unit: true })}) avviker fra bunnteksten (${formatOre(footer.totalOutOre, { unit: true })}) med ${formatOre(Math.abs(sumOut - footer.totalOutOre), { unit: true })}.`,
    );
  }
  if (footer.openingBalanceOre != null && footer.closingBalanceOre != null) {
    const net = (footer.totalInOre ?? sumIn) + (footer.totalOutOre ?? sumOut);
    const expected = footer.openingBalanceOre + net;
    if (expected !== footer.closingBalanceOre) {
      const diff = expected - footer.closingBalanceOre;
      warnings.push(
        `Saldo stemmer ikke: inngående ${formatOre(footer.openingBalanceOre, { unit: true })} + netto ${formatOre(net, { unit: true })} = ${formatOre(expected, { unit: true })}, men utgående saldo er ${formatOre(footer.closingBalanceOre, { unit: true })}. Avvik ${formatOre(diff, { unit: true })}.`,
      );
    }
  }
  return { sumInOre: sumIn, sumOutOre: sumOut, warnings };
}
