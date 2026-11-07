import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { PengeDb } from '../../src/db/schema';
import { importFiles } from '../../src/db/importer';
import { reclassifyAll } from '../../src/db/reclassify';
import { generateBankCsv } from './synthetic';
import { loadCategoryMap } from '../../src/db/repo';
import { monthlySeries, summarizeMonth } from '../../src/core/aggregate';
import { monthRange } from '../../src/core/aggregate';

const ROWS = Number(process.env.PERF_ROWS ?? 50_000);

describe('performance with synthetic data', () => {
  it(
    `imports, classifies and aggregates ${ROWS} rows in reasonable time`,
    async () => {
      const db = new PengeDb(`test-perf-${Date.now()}`);
      const start = new Date(Date.UTC(2023, 10, 1));
      const files = [
        {
          name: 'a.csv',
          text: generateBankCsv({ accountNumber: '1111 22 33001', accountName: 'Brukskonto', rows: Math.ceil(ROWS * 0.7), seed: 1, start, days: 1095, otherOwnAccount: '1111 22 33002', owner: 'Ola Fiktiv Testesen' }),
        },
        {
          name: 'b.csv',
          text: generateBankCsv({ accountNumber: '1111 22 33002', accountName: 'Sparing', rows: Math.floor(ROWS * 0.3), seed: 2, start, days: 1095, otherOwnAccount: '1111 22 33001', owner: 'Ola Fiktiv Testesen' }),
        },
      ];
      const t0 = performance.now();
      const { plan } = await importFiles(db, files);
      const t1 = performance.now();
      expect(plan.errors).toEqual([]);
      expect(await db.transactions.count()).toBe(ROWS);

      const r = await reclassifyAll(db, '2026-11-10');
      const t2 = performance.now();
      expect(r.total).toBe(ROWS);

      const txs = await db.transactions.toArray();
      const categories = await loadCategoryMap(db);
      const t3 = performance.now();
      const months = monthRange('2025-11', '2026-10');
      const series = monthlySeries(txs, categories, months);
      const summary = summarizeMonth(txs, categories, '2026-06');
      const t4 = performance.now();
      expect(series).toHaveLength(12);
      expect(summary.txCount).toBeGreaterThan(0);

      const again = await reclassifyAll(db, '2026-11-10');
      const t5 = performance.now();
      expect(again.written).toBe(0);

      const line = `perf ${ROWS} rows: import ${Math.round(t1 - t0)} ms, reclassify ${Math.round(t2 - t1)} ms, load ${Math.round(t3 - t2)} ms, aggregate 12 months ${Math.round(t4 - t3)} ms, reclassify (no changes) ${Math.round(t5 - t4)} ms`;
      if (process.env.PERF_LOG) appendFileSync(process.env.PERF_LOG, `${line}\n`);
      expect(t4 - t3).toBeLessThan(2000);
      expect(t2 - t1).toBeLessThan(30_000);
    },
    180_000,
  );
});
