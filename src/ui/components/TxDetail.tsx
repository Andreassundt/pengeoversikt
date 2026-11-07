import { useEffect, useState } from 'react';
import type { Split, Transaction } from '../../core/types';
import { formatDateLong, formatDateNo } from '../../core/dates';
import { formatMinor, formatOre, parseAmountNo } from '../../core/money';
import { RAW } from '../../core/types';
import { Amount, Badge, Button, Field, Sheet, Toggle, inputClass } from './basics';
import { CategoryPicker } from './CategoryPicker';
import { flagBadges, type TxContext } from './TxList';
import { useAsync, useData } from '../data';
import { dismissDouble, setCategory, setNote, setOneOff, setSplits, unlockManual } from '../../db/actions';
import { CAT } from '../../core/categories';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'satt manuelt',
  structural: 'bankens type/undertype',
  rule: 'egen regel',
  learned: 'lært fra retting',
  dictionary: 'butikkordboken',
  keyword: 'nøkkelord i meldingen',
  person: 'personstandard',
  heuristic: 'tommelfingerregel',
  none: 'ingen treff',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === '' || value == null) return null;
  return (
    <div className="flex gap-3 py-2 text-sm">
      <div className="w-28 shrink-0 text-slate-500 dark:text-slate-400">{label}</div>
      <div className="min-w-0 flex-1 break-words">{value}</div>
    </div>
  );
}

export function TxDetail({ tx: txProp, ctx, onClose, onOpen }: { tx: Transaction | null; ctx: TxContext; onClose: () => void; onOpen: (id: number) => void }) {
  const { db, mutate, busy } = useData();
  // Re-read the transaction after every data change so the sheet reflects learning and reclassification.
  const { data: fresh } = useAsync(async () => (txProp?.id != null ? ((await db.transactions.get(txProp.id)) ?? txProp) : null), [txProp?.id]);
  const tx = fresh && txProp && fresh.id === txProp.id ? fresh : txProp;
  const [picker, setPicker] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [note, setNoteText] = useState('');
  const [tags, setTags] = useState('');
  const [linked, setLinked] = useState<Transaction | null>(null);

  useEffect(() => {
    setNoteText(tx?.note ?? '');
    setTags(tx?.tags.join(', ') ?? '');
    setPendingCategory(null);
    setSplitOpen(false);
    if (tx?.linkedTxId != null) {
      db.transactions.get(tx.linkedTxId).then((t) => setLinked(t ?? null));
    } else setLinked(null);
  }, [tx, db]);

  if (!tx) return null;
  const category = ctx.categories.get(tx.categoryId);
  const account = ctx.accounts.get(tx.accountId);
  const kind = category?.kind ?? tx.kind;
  const canLearn = (tx.merchantKey !== '' || tx.personId != null) && !tx.isCardPurchase ? true : tx.merchantKey !== '';
  const learnLabel = tx.personId != null ? `alle betalinger ${tx.direction === 'in' ? 'fra' : 'til'} ${tx.displayName}` : `alle fra ${tx.displayName || tx.merchantText}`;

  const applyCategory = async (categoryId: string, scope: 'this' | 'all') => {
    setPendingCategory(null);
    await mutate(() => setCategory(db, tx.id!, categoryId, scope));
  };

  const saveNote = async () => {
    await mutate(
      () =>
        setNote(
          db,
          tx.id!,
          note.trim(),
          tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      { reclassify: false },
    );
  };

  return (
    <Sheet open={tx != null} onClose={onClose} title="Transaksjon" tall>
      <div className="mb-3">
        <div className="text-xl font-semibold">{tx.displayName || tx.description}</div>
        <div className="mt-1 text-3xl font-semibold">
          <Amount ore={tx.amountOre} colored />
        </div>
        {tx.card && tx.card.currency !== 'NOK' && (
          <div className="amount text-sm text-slate-500">
            {formatMinor(tx.card.amountMinor, tx.card.currency)} · kurs {tx.card.rate.replace('.', ',')}
          </div>
        )}
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {tx.purchaseDate && tx.purchaseDate !== tx.date
            ? `Kjøpt ${formatDateLong(tx.purchaseDate)}, utført ${formatDateNo(tx.date)}`
            : formatDateLong(tx.date)}
          {tx.status === 'reserved' && ' · reservert'}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {flagBadges(tx).map((b) => (
            <Badge key={b.text} tone={b.tone}>
              {b.text}
            </Badge>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPicker(true)}
        className="flex min-h-12 w-full items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-left dark:bg-slate-800"
      >
        <span>
          <span className="block text-xs text-slate-500">Kategori</span>
          <span className="font-medium">
            {category?.icon} {category?.name ?? tx.categoryId}
          </span>
        </span>
        <span className="text-slate-400">Endre ›</span>
      </button>
      {tx.splits && tx.splits.length > 0 && (
        <ul className="mt-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          {tx.splits.map((s, i) => (
            <li key={i} className="flex justify-between py-0.5">
              <span>{ctx.categories.get(s.categoryId)?.name ?? s.categoryId}</span>
              <Amount ore={s.amountOre} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setSplitOpen(true)}>
          {tx.splits ? 'Endre splitt' : 'Splitt'}
        </Button>
        {tx.manual && (
          <Button variant="secondary" size="sm" onClick={() => mutate(() => unlockManual(db, tx.id!))}>
            Lås opp (automatisk kategori)
          </Button>
        )}
        {tx.flags.includes('possibleDouble') && (
          <Button variant="secondary" size="sm" onClick={() => mutate(() => dismissDouble(db, tx.id!), { reclassify: false })}>
            Ikke dobbelttrekk
          </Button>
        )}
      </div>

      {(kind === 'expense' || kind === 'income' || kind === 'unknown') && (
        <div className="mt-3">
          <Toggle
            checked={tx.flags.includes('oneOff')}
            onChange={(v) => mutate(() => setOneOff(db, tx.id!, v))}
            label="Engangspost (holdes utenfor normalt forbruk)"
          />
        </div>
      )}

      {linked && (
        <button
          type="button"
          onClick={() => onOpen(linked.id!)}
          className="mt-3 flex min-h-12 w-full items-center justify-between rounded-xl bg-emerald-50 px-3 text-left text-sm dark:bg-emerald-900/30"
        >
          <span>
            {tx.flags.includes('refund') ? 'Refusjon for kjøp' : 'Refundert av'} {formatDateNo(linked.statDate)}
          </span>
          <Amount ore={linked.amountOre} colored />
        </button>
      )}

      <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        <Row label="Konto" value={account ? `${account.name} (${account.number})` : tx.accountId} />
        <Row label="Motpart" value={[tx.counterpartyName, tx.counterpartyAccount].filter(Boolean).join(' · ')} />
        <Row label="Type" value={[tx.type, tx.subtype].filter(Boolean).join(' / ')} />
        <Row label="Råtekst" value={tx.raw[RAW.description]} />
        <Row label="Melding" value={tx.raw[RAW.message] ? <pre className="whitespace-pre-wrap font-sans">{tx.raw[RAW.message]}</pre> : ''} />
        <Row
          label="Kort"
          value={tx.card ? `•••• ${tx.card.last4} · ${tx.card.currency} ${tx.card.amountText.replace('.', ',')} · kurs ${tx.card.rate.replace('.', ',')}` : ''}
        />
        <Row label="Via" value={tx.provider ?? ''} />
        <Row label="Bokført" value={tx.bookedDate ? formatDateNo(tx.bookedDate) : ''} />
        <Row label="Kategorisert av" value={`${SOURCE_LABELS[tx.source] ?? tx.source} · ${tx.confidence} sikkerhet`} />
      </div>

      <div className="mt-3">
        <Field label="Notat">
          <textarea value={note} onChange={(e) => setNoteText(e.target.value)} rows={2} className={`${inputClass} py-2`} />
        </Field>
        <Field label="Merkelapper (kommaseparert)">
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} />
        </Field>
        <Button variant="secondary" onClick={saveNote} disabled={busy}>
          Lagre notat
        </Button>
      </div>

      <CategoryPicker
        open={picker}
        onClose={() => setPicker(false)}
        categories={ctx.categories}
        groups={ctx.groups}
        current={tx.categoryId}
        onPick={(id) => {
          setPicker(false);
          if (canLearn && id !== tx.categoryId) setPendingCategory(id);
          else void applyCategory(id, 'this');
        }}
      />

      <Sheet open={pendingCategory != null} onClose={() => setPendingCategory(null)} title="Gjelder det flere?">
        {pendingCategory && (
          <div className="space-y-3 pb-2">
            <p>
              Sett <strong>{ctx.categories.get(pendingCategory)?.name}</strong> på {learnLabel}?
            </p>
            <Button full onClick={() => applyCategory(pendingCategory, 'all')}>
              Ja, alle lignende
            </Button>
            <Button full variant="secondary" onClick={() => applyCategory(pendingCategory, 'this')}>
              Bare denne
            </Button>
          </div>
        )}
      </Sheet>

      <SplitEditor open={splitOpen} onClose={() => setSplitOpen(false)} tx={tx} ctx={ctx} />
    </Sheet>
  );
}

function SplitEditor({ open, onClose, tx, ctx }: { open: boolean; onClose: () => void; tx: Transaction; ctx: TxContext }) {
  const { db, mutate } = useData();
  const [rows, setRows] = useState<Array<{ categoryId: string; amount: string }>>([]);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const initial = tx.splits && tx.splits.length > 0 ? tx.splits : [{ categoryId: tx.categoryId, amountOre: tx.amountOre }];
    setRows(initial.map((s) => ({ categoryId: s.categoryId, amount: formatOre(Math.abs(s.amountOre), { unit: false }) })));
    setError(null);
  }, [open, tx]);

  const total = Math.abs(tx.amountOre);
  const sum = rows.reduce((a, r) => a + (parseAmountNo(r.amount) ?? 0), 0);
  const remaining = total - sum;

  const save = async () => {
    const splits: Split[] = rows.map((r) => ({
      categoryId: r.categoryId,
      amountOre: (parseAmountNo(r.amount) ?? 0) * (tx.amountOre < 0 ? -1 : 1),
    }));
    if (remaining !== 0) {
      setError(`Splittene må summere til ${formatOre(total, { unit: true })}. Rest: ${formatOre(remaining, { unit: true })}.`);
      return;
    }
    await mutate(() => setSplits(db, tx.id!, splits.length > 1 ? splits : null));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Splitt transaksjonen">
      <p className="mb-2 text-sm text-slate-500">
        Beløp: <Amount ore={tx.amountOre} /> · Rest: <Amount ore={remaining * (tx.amountOre < 0 ? -1 : 1)} />
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerIndex(i)}
              className="min-h-11 flex-1 rounded-xl bg-slate-100 px-3 text-left text-sm dark:bg-slate-800"
            >
              {ctx.categories.get(r.categoryId)?.name ?? 'Velg kategori'}
            </button>
            <input
              inputMode="decimal"
              value={r.amount}
              aria-label="Beløp"
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              className={`${inputClass} w-28`}
            />
            <button
              type="button"
              aria-label="Fjern"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              className="h-11 w-11 rounded-full text-xl text-slate-500"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          onClick={() => setRows([...rows, { categoryId: CAT.annet, amount: formatOre(Math.max(0, remaining), { unit: false }) }])}
        >
          + Legg til del
        </Button>
        <Button onClick={save}>Lagre</Button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <CategoryPicker
        open={pickerIndex != null}
        onClose={() => setPickerIndex(null)}
        categories={ctx.categories}
        groups={ctx.groups}
        onPick={(id) => {
          setRows(rows.map((x, j) => (j === pickerIndex ? { ...x, categoryId: id } : x)));
          setPickerIndex(null);
        }}
      />
    </Sheet>
  );
}
