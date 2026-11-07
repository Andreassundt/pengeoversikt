import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups } from '../hooks';
import { ROLE_LABELS } from '../../db/repo';
import type { AccountRole, Transaction } from '../../core/types';
import { addDays, formatDateNo, todayIso } from '../../core/dates';
import { Amount, Button, Card, Field, PageHeader, Spinner, Toggle, daysAgoText, inputClass } from '../components/basics';
import { BalanceLine } from '../components/Charts';
import { TxList } from '../components/TxList';
import { TxDetail } from '../components/TxDetail';

export function Accounts() {
  const lookups = useLookups();
  const navigate = useNavigate();
  if (!lookups) return <Spinner />;
  const total = lookups.accountList.filter((a) => !a.hidden).reduce((s, a) => s + a.balanceOre, 0);
  return (
    <div>
      <PageHeader title="Kontoer" back={() => navigate('/mer')} />
      <div className="space-y-3 p-4">
        <Card>
          <div className="text-sm text-slate-500">Total saldo</div>
          <div className="text-2xl font-semibold">
            <Amount ore={total} />
          </div>
        </Card>
        {lookups.accountList.map((a) => (
          <Card key={a.id} onClick={() => navigate(`/mer/kontoer/${a.id}`)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {a.name} {a.hidden && <span className="text-xs text-slate-400">(skjult)</span>}
                </div>
                <div className="text-sm text-slate-500">
                  {ROLE_LABELS[a.role]} · {a.number}
                </div>
              </div>
              <div className="text-right">
                <Amount ore={a.balanceOre} className="font-semibold" />
                <div className="text-xs text-slate-500">{a.balanceDate ? `pr. ${formatDateNo(a.balanceDate)}` : ''}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AccountDetail() {
  const { id } = useParams();
  const accountId = Number(id);
  const { db, engine, mutate } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const today = todayIso();
  const { data: balance } = useAsync(() => engine.balanceHistory(accountId, addDays(today, -180), today), [accountId]);
  const { data: txs } = useAsync(async () => {
    const list = await db.transactions.where('accountId').equals(accountId).toArray();
    list.sort((a, b) => (a.statDate < b.statDate ? 1 : a.statDate > b.statDate ? -1 : (b.id ?? 0) - (a.id ?? 0)));
    return list;
  }, [accountId]);

  if (!lookups) return <Spinner />;
  const account = lookups.accounts.get(accountId);
  if (!account) return <p className="p-4">Fant ikke kontoen.</p>;

  const openTx = async (txId: number) => {
    const tx = await db.transactions.get(txId);
    if (tx) setSelected(tx);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={account.name} back={() => navigate('/mer/kontoer')} />
      <div className="space-y-3 p-4">
        <Card>
          <div className="text-sm text-slate-500">Saldo {account.balanceDate && `pr. ${formatDateNo(account.balanceDate)}`}</div>
          <div className="text-2xl font-semibold">
            <Amount ore={account.balanceOre} />
          </div>
          <div className="text-sm text-slate-500">Sist importert {daysAgoText(account.lastImportAt)}</div>
          {balance && balance.length > 1 && (
            <div className="mt-3">
              <BalanceLine points={balance} />
            </div>
          )}
        </Card>
        <Card>
          <Field label="Navn">
            <input
              defaultValue={account.name}
              className={inputClass}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== account.name) void mutate(() => db.accounts.update(accountId, { name }).then(() => undefined), { reclassify: false });
              }}
            />
          </Field>
          <Field label="Rolle">
            <select
              value={account.role}
              className={inputClass}
              onChange={(e) => void mutate(() => db.accounts.update(accountId, { role: e.target.value as AccountRole }).then(() => undefined), { reclassify: false })}
            >
              {(Object.keys(ROLE_LABELS) as AccountRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <Toggle
            checked={account.hidden}
            onChange={(v) => void mutate(() => db.accounts.update(accountId, { hidden: v }).then(() => undefined), { reclassify: false })}
            label="Skjul i oversikten"
          />
          <div className="text-xs text-slate-500">Kontonummer {account.number}</div>
        </Card>
        <Button variant="secondary" full onClick={() => navigate(`/transaksjoner?konto=${accountId}`)}>
          Alle transaksjoner på kontoen
        </Button>
      </div>
      <h2 className="px-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Siste transaksjoner</h2>
      <TxList transactions={(txs ?? []).slice(0, 200)} ctx={lookups} onSelect={setSelected} className="min-h-0 flex-1" />
      <TxDetail tx={selected} ctx={lookups} onClose={() => setSelected(null)} onOpen={openTx} />
    </div>
  );
}
