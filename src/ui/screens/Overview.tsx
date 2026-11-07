import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups, useSwipe } from '../hooks';
import { addMonths, monthKey, todayIso } from '../../core/dates';
import { Amount, Button, Card, EmptyState, SectionTitle, Spinner, daysAgoText } from '../components/basics';
import { MonthNav } from '../components/MonthNav';
import { BarList } from '../components/Charts';
import { TxRow } from '../components/TxList';
import { TxDetail } from '../components/TxDetail';
import { ImportSheet } from '../components/ImportSheet';
import type { Transaction } from '../../core/types';

export function Overview({ sharedFiles, onSharedConsumed }: { sharedFiles: File[] | null; onSharedConsumed: () => void }) {
  const { engine, db, settings } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const currentMonth = monthKey(todayIso());
  const month = params.get('m') ?? currentMonth;
  const setMonth = (m: string) => setParams(m === currentMonth ? {} : { m });
  const [importOpen, setImportOpen] = useState(sharedFiles != null && sharedFiles.length > 0);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const swipe = useSwipe(
    () => month < currentMonth && setMonth(addMonths(month, 1)),
    () => setMonth(addMonths(month, -1)),
  );
  const { data, loading } = useAsync(() => engine.overview(month), [month]);

  const openTx = async (id: number) => {
    const tx = await db.transactions.get(id);
    if (tx) setSelected(tx);
  };

  if (!lookups || (loading && !data)) return <Spinner />;
  if (!data) return null;

  if (!data.hasData) {
    return (
      <div className="p-4">
        <EmptyState
          icon="📥"
          title="Ingen data ennå"
          text="Eksporter transaksjonslister som CSV fra nettbanken (én fil per konto) og importer dem her. Alt lagres bare på denne enheten."
          action={
            <Button size="lg" onClick={() => setImportOpen(true)} data-testid="import-button">
              Importer
            </Button>
          }
        />
        <ImportSheet
          open={importOpen}
          onClose={() => {
            setImportOpen(false);
            onSharedConsumed();
          }}
          initialFiles={sharedFiles}
        />
      </div>
    );
  }

  const s = data.summary;
  const days = data.lastImportAt ? Math.floor((Date.now() - new Date(data.lastImportAt).getTime()) / 86_400_000) : null;
  const avg = data.previousNormalAvgOre;
  const diffPct = avg && avg > 0 ? Math.round(((s.expenseNormalOre - avg) * 100) / avg) : null;

  return (
    <div className="space-y-4 p-4" {...swipe}>
      <MonthNav month={month} onChange={setMonth} max={currentMonth} />

      {data.reviewCount > 0 && (
        <Card onClick={() => navigate('/sjekk')} className="border-l-4 border-l-amber-500" testId="review-card">
          <div className="flex items-center justify-between">
            <span className="font-medium">Sjekk disse ({data.reviewCount})</span>
            <span className="text-slate-400">›</span>
          </div>
          <p className="text-sm text-slate-500">Uavklarte, usikre, engangsposter og nye personer.</p>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-xs text-slate-500">Inn</div>
          <div className="text-lg font-semibold" data-testid="inntekt">
            <Amount ore={s.incomeOre} decimals={0} unit={false} />
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">Ut</div>
          <div className="text-lg font-semibold" data-testid="sum-forbruk">
            <Amount ore={s.expenseOre} decimals={0} unit={false} />
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">Netto spart</div>
          <div className="text-lg font-semibold" data-testid="netto-spart">
            <Amount ore={s.netSavedOre} decimals={0} unit={false} colored />
          </div>
          {s.savingsRatePermille != null && <div className="text-xs text-slate-500">{Math.round(s.savingsRatePermille / 10)} % sparerate</div>}
        </Card>
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-500">Normalt forbruk</span>
          <span className="text-xl font-semibold" data-testid="normalt-forbruk">
            <Amount ore={s.expenseNormalOre} />
          </span>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-500">Sum forbruk inkl. engangs</span>
          <span data-testid="sum-forbruk-full">
            <Amount ore={s.expenseOre} />
          </span>
        </div>
        {avg != null && (
          <div className="mt-1 text-sm text-slate-500">
            Snitt siste 3 hele måneder: <Amount ore={avg} decimals={0} />
            {diffPct != null && <span className={diffPct > 0 ? 'text-rose-600' : 'text-emerald-700'}> ({diffPct > 0 ? '+' : ''}{diffPct} %)</span>}
          </div>
        )}
        {(s.unknownOutOre > 0 || s.unknownInOre > 0) && (
          <Link to="/sjekk" className="mt-2 block rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            Uavklart: <Amount ore={s.unknownOutOre} decimals={0} /> ut / <Amount ore={s.unknownInOre} decimals={0} /> inn – telles ikke med. Sjekk disse ›
          </Link>
        )}
      </Card>

      {data.topCategories.length > 0 && (
        <Card>
          <SectionTitle action={<Link to="/statistikk" className="text-sm text-brand-700">Statistikk ›</Link>}>Største kategorier</SectionTitle>
          <BarList
            hideAmounts={settings.hideAmounts}
            items={data.topCategories.map((t) => {
              const c = lookups.categories.get(t.categoryId);
              return {
                label: c?.name ?? t.categoryId,
                ore: -t.sumOre,
                color: c?.color ?? lookups.groups.get(c?.groupId ?? '')?.color ?? '#94a3b8',
                onClick: () => navigate(`/transaksjoner?kategori=${t.categoryId}&m=${month}`),
              };
            })}
          />
        </Card>
      )}

      <Card>
        <SectionTitle action={<Link to="/mer/kontoer" className="text-sm text-brand-700">Kontoer ›</Link>}>Saldo</SectionTitle>
        <div className="mb-2 text-2xl font-semibold">
          <Amount ore={data.totalBalanceOre} />
        </div>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {data.accounts
            .filter((a) => !a.hidden)
            .map((a) => (
              <li key={a.id} className="flex justify-between py-1.5">
                <span>{a.name}</span>
                <Amount ore={a.balanceOre} />
              </li>
            ))}
        </ul>
      </Card>

      <Card onClick={() => navigate('/faste')}>
        <div className="flex items-center justify-between">
          <span className="font-medium">Faste trekk denne måneden</span>
          <span>
            <Amount ore={data.recurringMonthlyOre} decimals={0} /> <span className="text-slate-400">›</span>
          </span>
        </div>
        <p className="text-sm text-slate-500">{data.recurringCount} trekk</p>
      </Card>

      <Card className="p-0">
        <div className="px-4 pt-4">
          <SectionTitle action={<Link to="/transaksjoner" className="text-sm text-brand-700">Alle ›</Link>}>Siste transaksjoner</SectionTitle>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.recent.map((tx) => (
            <TxRow key={tx.id} tx={tx} ctx={lookups} onClick={setSelected} />
          ))}
        </div>
      </Card>

      <div className="space-y-2 pb-4">
        <Button full size="lg" onClick={() => setImportOpen(true)} data-testid="import-button">
          Importer
        </Button>
        <p className="text-center text-sm text-slate-500">
          Sist importert {daysAgoText(data.lastImportAt)}.
          {days != null && days >= 30 && <span className="text-amber-700"> Det er over 30 dager siden – på tide med en ny eksport.</span>}
        </p>
      </div>

      <ImportSheet
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          onSharedConsumed();
        }}
        initialFiles={sharedFiles}
      />
      <TxDetail tx={selected} ctx={lookups} onClose={() => setSelected(null)} onOpen={openTx} />
    </div>
  );
}
