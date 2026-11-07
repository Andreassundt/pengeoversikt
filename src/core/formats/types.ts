import type { Footer, RawRow } from '../types';

export interface FormatOutput {
  rows: RawRow[];
  footer: Footer | null;
  warnings: string[];
}

export interface FileFormat {
  id: string;
  name: string;
  matches(header: string[]): boolean;
  /** Converts all CSV rows (including the header row) into canonical raw rows. */
  toRawRows(rows: string[][]): FormatOutput;
}
