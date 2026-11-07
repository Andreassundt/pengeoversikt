import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups } from '../hooks';
import { Amount, Button, Card, EmptyState, PageHeader, SectionTitle, Spinner } from '../components/basics';
import { TxRow } from '../components/TxList';
import { TxDetail } from '../components/TxDetail';
import { CategoryPicker } from '../components/CategoryPicker';
import { acknowledgeImportWarnings, confirmOneOff, dismissDouble, markPersonReviewed, setCategory, setOneOff } from '../../db/actions';
import type { Transaction } from '../../core/types';
import { CAT } from '../../core/categories';

const QUICK = [CAT.dagligvarer, CAT.matUte, CAT.annet, CAT.deltHusholdning, CAT.gaverGitt, CAT.intern];

export function Review() {
  const { engine, db, mutate } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [picker, setPicker] = useState<Transaction | null>(null);
  const { data, loading } = useAsync(() => engine.review(), []);

  const openTx = async (id: number) => {
    const tx = await db.transactions.get(id);
    if (tx) setSelected(tx);
  };

  if (!lookups || (loading && !data)) return <Spinner />;
  if (!data) return null;

  const quickSet = (tx: Transaction, categoryId: string) => mutate(() => setCategory(db, tx.id!, categoryId, tx.merchantKey ? 'all' : 'this'));

  const section = (title: string, txs: Transaction[], actions: (tx: Transaction) => React.ReactNode) =>
    txs.length > 0 && (
      <Card className="p-0">
        <div className="px-4 pt-3">
          <SectionTitle>
            {title} ({txs.length})
          </SectionTitle>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {txs.slice(0, 50).map((tx) => (
            <li key={tx.id}>
              <TxRow tx={tx} ctx={lookups} onClick={setSelected} />
              <div className="flex flex-wrap gap-1 px-4 pb-3">{actions(tx)}</div>
            </li>
          ))}
        </ul>
      </Card>
    );

  return (
    <div className="pb-6">
      <PageHeader title="Sjekk disse" back={() => navigate(-1)} />
      <div className="space-y-4 p-4">
        {data.total === 0 && <EmptyState icon="✅" title="Alt er i orden" text="Ingenting trenger avklaring akkurat nå." />}

        {data.importWarnings.length > 0 && (
          <Card>
            <SectionTitle>Import-advarsler</SectionTitle>
            <ul className="space-y-2 text-sm">
              {data.importWarnings.map((r) => (
                <li key={r.id} className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/30">
                  <div className="font-medium">{r.fileName}</div>
                  <ul className="list-disc pl-4">
                    {r.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => mutate(() => acknowledgeImportWarnings(db, r.id!), { reclassify: false })}>
                    OK, sett
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {data.newPersons.length > 0 && (
          <Card>
            <SectionTitle>Nye personer</SectionTitle>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.newPersons.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <button type="button" className="text-left font-medium" onClick={() => navigate(`/mer/personer/${p.id}`)}>
                    {p.displayName}
                    <span className="block text-xs text-slate-500">{p.accountNumbers.join(', ')}</span>
                  </button>
                  <Button size="sm" variant="secondary" onClick={() => mutate(() => markPersonReviewed(db, p.id!), { reclassify: false })}>
                    OK
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {section('Uavklart', data.unknown, (tx) => (
          <>
            {QUICK.map((id) => (
              <Button key={id} size="sm" variant="secondary" onClick={() => quickSet(tx, id)}>
                {lookups.categories.get(id)?.name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setPicker(tx)}>
              Annen…
            </Button>
          </>
        ))}

        {section('Lav sikkerhet', data.lowConfidence, (tx) => (
          <>
            <Button size="sm" variant="secondary" onClick={() => mutate(() => setCategory(db, tx.id!, tx.categoryId, 'this'))}>
              Riktig
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicker(tx)}>
              Endre…
            </Button>
          </>
        ))}

        {section('Nye engangsposter', data.oneOffs, (tx) => (
          <>
            <Button size="sm" variant="secondary" onClick={() => mutate(() => confirmOneOff(db, tx.id!), { reclassify: false })}>
              Bekreft
            </Button>
            <Button size="sm" variant="ghost" onClick={() => mutate(() => setOneOff(db, tx.id!, false))}>
              Ikke engangs
            </Button>
          </>
        ))}

        {section('Mulige dobbelttrekk', data.doubles, (tx) => (
          <Button size="sm" variant="secondary" onClick={() => mutate(() => dismissDouble(db, tx.id!), { reclassify: false })}>
            Ikke dobbelttrekk
          </Button>
        ))}

        {data.total > 0 && (
          <p className="text-center text-sm text-slate-500">
            Totalt <Amount ore={data.unknown.reduce((a, t) => a + Math.abs(t.amountOre), 0)} decimals={0} /> uavklart.
          </p>
        )}
      </div>
      <TxDetail tx={selected} ctx={lookups} onClose={() => setSelected(null)} onOpen={openTx} />
      <CategoryPicker
        open={picker != null}
        onClose={() => setPicker(null)}
        categories={lookups.categories}
        groups={lookups.groups}
        quick={QUICK}
        current={picker?.categoryId}
        onPick={(id) => {
          const tx = picker;
          setPicker(null);
          if (tx) void quickSet(tx, id);
        }}
      />
    </div>
  );
}
