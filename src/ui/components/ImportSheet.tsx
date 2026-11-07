import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commitImport, prepareImport, type ImportInput, type ImportPlan } from '../../db/importer';
import { decodeCsvBytes } from '../../core/csv';
import { formatDateNo } from '../../core/dates';
import { useData } from '../data';
import { Amount, Badge, Button, Sheet, Spinner } from './basics';

type Phase = 'pick' | 'planning' | 'plan' | 'committing' | 'done';

export interface ImportSheetProps {
  open: boolean;
  onClose: () => void;
  /** Files handed over from the share target or drag and drop. */
  initialFiles?: File[] | null;
}

async function toInputs(files: File[]): Promise<ImportInput[]> {
  const out: ImportInput[] = [];
  for (const f of files) out.push({ name: f.name, text: decodeCsvBytes(await f.arrayBuffer()) });
  return out;
}

export function ImportSheet({ open, onClose, initialFiles }: ImportSheetProps) {
  const { db, mutate, settings } = useData();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ changed: number; files: number } | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setPhase('planning');
      setError(null);
      try {
        const inputs = await toInputs(files);
        const p = await prepareImport(db, inputs);
        setPlan(p);
        setPhase('plan');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('pick');
      }
    },
    [db],
  );

  useEffect(() => {
    if (open && initialFiles && initialFiles.length > 0) void handleFiles(initialFiles);
  }, [open, initialFiles, handleFiles]);

  useEffect(() => {
    if (!open) {
      setPhase('pick');
      setPlan(null);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const confirm = async () => {
    if (!plan) return;
    setPhase('committing');
    try {
      const wasFirst = (await db.accounts.count()) === 0;
      const r = await mutate(async () => {
        await commitImport(db, plan);
      });
      setResult({ changed: r?.changed ?? 0, files: plan.files.length });
      setPhase('done');
      if (wasFirst || !settings.wizardDone) {
        onClose();
        navigate('/oppsett');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('plan');
    }
  };

  const totalNew = plan?.files.reduce((a, f) => a + f.counts.newBooked + f.counts.reservedAdded, 0) ?? 0;

  return (
    <Sheet open={open} onClose={onClose} title="Importer" tall={phase === 'plan'}>
      {phase === 'pick' && (
        <div className="space-y-4 pb-2">
          <p className="text-slate-600 dark:text-slate-400">
            Velg én eller flere CSV-filer fra nettbanken. Appen finner selv ut hvilken konto hver fil gjelder, og det er trygt å importere
            overlappende perioder.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,text/comma-separated-values,text/plain"
            multiple
            data-testid="file-input"
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void handleFiles(files);
            }}
          />
          <Button full size="lg" onClick={() => inputRef.current?.click()}>
            Velg filer
          </Button>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFiles(Array.from(e.dataTransfer.files));
            }}
            className="hidden rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 sm:block"
          >
            …eller dra og slipp filene her
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      )}
      {phase === 'planning' && <Spinner label="Leser filene…" />}
      {phase === 'committing' && <Spinner label="Lagrer og klassifiserer…" />}
      {phase === 'plan' && plan && (
        <div className="space-y-3 pb-2">
          {plan.errors.map((err) => (
            <div key={err.fileName} className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
              <strong>{err.fileName}:</strong> {err.message}
            </div>
          ))}
          {plan.files.map((f) => (
            <div key={f.fileName} className="rounded-2xl bg-slate-100 p-3 text-sm dark:bg-slate-800" data-testid="import-file">
              <div className="flex items-center justify-between">
                <strong>
                  {f.accountName}
                  {f.isNewAccount && <Badge tone="info"> ny konto</Badge>}
                </strong>
                <span className="text-slate-500">{f.accountNumber}</span>
              </div>
              <div className="text-slate-500">
                {f.fileName}
                {f.periodStart && f.periodEnd && ` · ${formatDateNo(f.periodStart)}–${formatDateNo(f.periodEnd)}`}
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <li>Rader: {f.counts.rows}</li>
                <li>Nye: {f.counts.newBooked + f.counts.reservedAdded}</li>
                <li>Duplikater: {f.counts.duplicates}</li>
                <li>Reserverte erstattet: {f.counts.reservedRemoved}</li>
                {f.counts.reservedSkipped > 0 && <li>Reserverte hoppet over: {f.counts.reservedSkipped}</li>}
                <li>Trenger avklaring: {f.counts.needsReview}</li>
                {f.closingBalanceOre != null && (
                  <li className="col-span-2">
                    Saldo: <Amount ore={f.closingBalanceOre} />
                  </li>
                )}
              </ul>
              {f.warnings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {f.warnings.map((w, i) => (
                    <li key={i} className="rounded-lg bg-amber-100 px-2 py-1 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                      ⚠️ {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Avbryt
            </Button>
            <Button full onClick={confirm} disabled={plan.files.length === 0} data-testid="confirm-import">
              Importer {plan.files.length} {plan.files.length === 1 ? 'fil' : 'filer'} ({totalNew} nye)
            </Button>
          </div>
        </div>
      )}
      {phase === 'done' && result && (
        <div className="space-y-3 pb-2">
          <p>
            {result.files} {result.files === 1 ? 'fil' : 'filer'} importert.
            {result.changed > 0 && ` ${result.changed} transaksjoner fikk ny kategori ved reklassifisering.`}
          </p>
          <Button full onClick={onClose}>
            Lukk
          </Button>
        </div>
      )}
    </Sheet>
  );
}
