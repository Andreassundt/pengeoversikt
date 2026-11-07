import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data';
import { backupFileName, BackupNeedsPassword, exportBackup, parseBackup, restoreBackup, serializeBackup } from '../../db/backup';
import { exportTransactionsCsv } from '../../db/exportCsv';
import { nowIso } from '../../core/dates';
import { Button, Card, Field, PageHeader, Toggle, daysAgoText, inputClass } from '../components/basics';

/** Shares the file on mobile (share sheet) or downloads it elsewhere. */
async function deliverFile(name: string, content: string, type: string): Promise<'shared' | 'downloaded'> {
  const file = new File([content], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export function Backup() {
  const { db, settings, updateSetting, mutate, reloadSettings } = useData();
  const navigate = useNavigate();
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setError(null);
    setStatus(null);
    if (encrypt) {
      if (password.length < 8) return setError('Passordet må ha minst 8 tegn.');
      if (password !== password2) return setError('Passordene er ikke like.');
    }
    setWorking(true);
    try {
      const data = await exportBackup(db);
      const text = await serializeBackup(data, encrypt ? password : null);
      const how = await deliverFile(backupFileName(encrypt), text, 'application/json');
      await updateSetting('lastBackupAt', nowIso());
      setStatus(how === 'shared' ? 'Sikkerhetskopien ble delt.' : 'Sikkerhetskopien ble lastet ned.');
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const doCsv = async () => {
    setWorking(true);
    setError(null);
    try {
      const csv = await exportTransactionsCsv(db);
      await deliverFile(`pengeoversikt-transaksjoner-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
      setStatus('CSV-filen er klar.');
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const doRestore = async (file: File, pw: string | null) => {
    setError(null);
    setStatus(null);
    setWorking(true);
    try {
      const data = await parseBackup(await file.text(), pw);
      const ok = window.confirm(
        `Gjenopprette fra ${file.name}?\n\nAlle data i appen erstattes med ${data.transactions.length} transaksjoner og ${data.accounts.length} kontoer fra ${new Date(data.exportedAt).toLocaleString('nb-NO')}. Dette kan ikke angres.`,
      );
      if (!ok) return;
      await mutate(() => restoreBackup(db, data));
      await reloadSettings();
      setPendingFile(null);
      setRestorePassword('');
      setStatus('Gjenopprettet. Alt er på plass igjen.');
      navigate('/');
    } catch (e) {
      if (e instanceof BackupNeedsPassword) {
        setPendingFile(file);
        setStatus('Filen er kryptert – skriv inn passordet og trykk «Gjenopprett».');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <PageHeader title="Sikkerhetskopi" back={() => navigate('/mer')} />
      <div className="space-y-3 p-4">
        <p className="text-sm text-slate-500">
          Siste kopi: {daysAgoText(settings.lastBackupAt)}. Dataene ligger bare i denne nettleseren, så ta kopi jevnlig – og alltid før du bytter telefon.
        </p>
        <Card>
          <h2 className="mb-1 font-medium">Eksporter alt</h2>
          <Toggle checked={encrypt} onChange={setEncrypt} label="Krypter med passord (anbefalt)" />
          {encrypt && (
            <>
              <Field label="Passord" hint="Minst 8 tegn. Uten passordet kan ikke kopien åpnes av noen – heller ikke deg.">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={inputClass} />
              </Field>
              <Field label="Gjenta passord">
                <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" className={inputClass} />
              </Field>
            </>
          )}
          <Button full onClick={doExport} disabled={working}>
            Lag sikkerhetskopi
          </Button>
        </Card>
        <Card>
          <h2 className="mb-1 font-medium">Gjenopprett</h2>
          <p className="mb-2 text-sm text-slate-500">Erstatter alt i appen med innholdet i kopien, etter bekreftelse.</p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void doRestore(f, restorePassword || null);
            }}
          />
          {pendingFile ? (
            <>
              <Field label={`Passord for ${pendingFile.name}`}>
                <input type="password" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} className={inputClass} />
              </Field>
              <Button full onClick={() => doRestore(pendingFile, restorePassword)} disabled={working || !restorePassword}>
                Gjenopprett
              </Button>
            </>
          ) : (
            <Button full variant="secondary" onClick={() => fileRef.current?.click()} disabled={working}>
              Velg sikkerhetskopi
            </Button>
          )}
        </Card>
        <Card>
          <h2 className="mb-1 font-medium">Transaksjoner til Excel</h2>
          <p className="mb-2 text-sm text-slate-500">Alle transaksjoner med kategori som CSV (semikolon, UTF-8).</p>
          <Button full variant="secondary" onClick={doCsv} disabled={working}>
            Eksporter CSV
          </Button>
        </Card>
        {status && <p className="text-sm text-emerald-700 dark:text-emerald-400">{status}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
