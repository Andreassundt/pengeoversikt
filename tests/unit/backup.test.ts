import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { PengeDb } from '../../src/db/schema';
import { importFiles } from '../../src/db/importer';
import { reclassifyAll } from '../../src/db/reclassify';
import { EXPORT1_FILES, readFixture } from './helpers';
import { exportBackup, parseBackup, restoreBackup, serializeBackup } from '../../src/db/backup';
import { decryptText, encryptText } from '../../src/core/crypto';
import { exportTransactionsCsv } from '../../src/db/exportCsv';

describe('backup and export', () => {
  it('encrypts and decrypts with a password', async () => {
    const env = await encryptText('hemmelig tekst æøå', 'passord123', 1000);
    expect(env.encrypted).toBe(true);
    expect(env.data).not.toContain('hemmelig');
    expect(await decryptText(env, 'passord123')).toBe('hemmelig tekst æøå');
    await expect(decryptText(env, 'feil')).rejects.toThrow();
  });

  it('round-trips the whole database, encrypted', async () => {
    const db = new PengeDb(`test-backup-${Date.now()}`);
    await importFiles(db, EXPORT1_FILES.map((f) => ({ name: path.basename(f), text: readFixture(f) })));
    await reclassifyAll(db, '2026-11-10');
    const data = await exportBackup(db);
    expect(data.transactions).toHaveLength(109);
    const text = await serializeBackup(data, 'passord123');
    expect(text).not.toContain('Brukskonto');

    await expect(parseBackup(text, null)).rejects.toThrow(/kryptert/);
    const parsed = await parseBackup(text, 'passord123');
    const target = new PengeDb(`test-backup-restore-${Date.now()}`);
    await restoreBackup(target, parsed);
    expect(await target.transactions.count()).toBe(109);
    expect((await target.accounts.toArray()).map((a) => a.name).sort()).toEqual(['Bolig', 'Brukskonto', 'Forsikringer', 'Lønn', 'Sparing']);
    expect(await target.persons.count()).toBe(5);
    const plain = await serializeBackup(data, null);
    expect((await parseBackup(plain, null)).transactions).toHaveLength(109);
    await expect(parseBackup('{"foo":1}', null)).rejects.toThrow();
  });

  it('exports categorised transactions as CSV with BOM and semicolons', async () => {
    const db = new PengeDb(`test-csv-${Date.now()}`);
    await importFiles(db, EXPORT1_FILES.map((f) => ({ name: path.basename(f), text: readFixture(f) })));
    await reclassifyAll(db, '2026-11-10');
    const csv = await exportTransactionsCsv(db);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('Statistikkdato;Utført dato');
    // 109 transactions, the loan row becomes three split lines.
    expect(lines).toHaveLength(1 + 109 + 2);
    expect(csv).toContain('Rema 1000');
    expect(csv).toContain('-691,90');
  });
});
