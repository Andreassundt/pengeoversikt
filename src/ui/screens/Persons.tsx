import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups } from '../hooks';
import { addMonths, formatMonthShort, monthKey, todayIso } from '../../core/dates';
import { monthRange } from '../../core/aggregate';
import type { Transaction } from '../../core/types';
import { Amount, Button, Card, Field, PageHeader, Spinner, inputClass } from '../components/basics';
import { TxList } from '../components/TxList';
import { TxDetail } from '../components/TxDetail';
import { CategoryPicker } from '../components/CategoryPicker';
import { removePersonDefault, renamePerson, setPersonDefault, splitPerson } from '../../db/actions';

export function Persons() {
  const { db, engine } = useData();
  const navigate = useNavigate();
  const current = monthKey(todayIso());
  const months = monthRange(addMonths(current, -11), current);
  const { data } = useAsync(async () => {
    const persons = await db.persons.toArray();
    const stats = await Promise.all(persons.map((p) => engine.personStats(p.id!, months)));
    return persons.map((p, i) => ({ person: p, stats: stats[i]! })).sort((a, b) => b.stats.inOre + b.stats.outOre - (a.stats.inOre + a.stats.outOre));
  }, [db]);

  if (!data) return <Spinner />;
  return (
    <div>
      <PageHeader title="Personer" back={() => navigate('/mer')} />
      <div className="space-y-2 p-4">
        {data.length === 0 && <p className="text-slate-500">Ingen personer ennå.</p>}
        {data.map(({ person, stats }) => (
          <Card key={person.id} onClick={() => navigate(`/mer/personer/${person.id}`)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{person.displayName}</div>
                <div className="text-sm text-slate-500">
                  {stats.transactions.length} transaksjoner{person.role && person.role !== 'custom-name' ? ` · ${person.role}` : ''}
                </div>
              </div>
              <div className="text-right text-sm">
                <div>
                  Inn <Amount ore={stats.inOre} decimals={0} />
                </div>
                <div>
                  Ut <Amount ore={stats.outOre} decimals={0} />
                </div>
                <div className="font-semibold">
                  Netto <Amount ore={stats.inOre - stats.outOre} decimals={0} colored />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PersonDetail() {
  const { id } = useParams();
  const personId = Number(id);
  const { db, engine, mutate } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [picker, setPicker] = useState<{ direction: 'in' | 'out'; accountId: number | null } | null>(null);
  const current = monthKey(todayIso());
  const months = monthRange(addMonths(current, -11), current);
  const { data: person } = useAsync(() => db.persons.get(personId).then((p) => p ?? null), [personId]);
  const { data: stats } = useAsync(() => engine.personStats(personId, months), [personId]);

  if (!lookups || !person || !stats) return <Spinner />;

  const openTx = async (txId: number) => {
    const tx = await db.transactions.get(txId);
    if (tx) setSelected(tx);
  };
  const sorted = [...stats.transactions].sort((a, b) => (a.statDate < b.statDate ? 1 : -1));

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={person.displayName} back={() => navigate('/mer/personer')} />
      <div className="space-y-3 p-4">
        <Card>
          <Field label="Navn">
            <input
              defaultValue={person.displayName}
              className={inputClass}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== person.displayName) void mutate(() => renamePerson(db, personId, name));
              }}
            />
          </Field>
          <Field label="Rolle (fritekst)">
            <input
              defaultValue={person.role === 'custom-name' ? '' : person.role}
              placeholder="f.eks. leietaker, samboer"
              className={inputClass}
              onBlur={(e) => {
                const role = e.target.value.trim();
                void mutate(() => db.persons.update(personId, { role: person.role === 'custom-name' ? person.role : role }).then(() => undefined), { reclassify: false });
              }}
            />
          </Field>
          <div className="text-sm text-slate-500">Alias: {person.aliases.join(', ')}</div>
          <div className="mt-1 text-sm text-slate-500">Kontoer:</div>
          <ul className="text-sm">
            {person.accountNumbers.map((n) => (
              <li key={n} className="flex items-center justify-between py-1">
                <span>{n}</span>
                {person.accountNumbers.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => mutate(() => splitPerson(db, personId, n))}>
                    Del ut som egen person
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-1 font-medium">Standardkategorier</h2>
          <ul className="text-sm">
            {person.defaults.map((d, i) => (
              <li key={i} className="flex items-center justify-between py-1">
                <span>
                  {d.direction === 'in' ? 'Fra' : 'Til'} {person.displayName} {d.accountId != null ? `(${lookups.accounts.get(d.accountId)?.name})` : '(alle kontoer)'} →{' '}
                  {lookups.categories.get(d.categoryId)?.name}
                </span>
                <Button size="sm" variant="ghost" onClick={() => mutate(() => removePersonDefault(db, personId, d.direction, d.accountId ?? null))}>
                  Fjern
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPicker({ direction: 'in', accountId: null })}>
              + Fra person
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPicker({ direction: 'out', accountId: null })}>
              + Til person
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-medium">Per måned</h2>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left font-normal">Måned</th>
                <th className="text-right font-normal">Inn</th>
                <th className="text-right font-normal">Ut</th>
                <th className="text-right font-normal">Netto</th>
              </tr>
            </thead>
            <tbody>
              {stats.months
                .filter((m) => m.inOre !== 0 || m.outOre !== 0)
                .map((m) => (
                  <tr key={m.month}>
                    <td>{formatMonthShort(m.month)}</td>
                    <td className="text-right">
                      <Amount ore={m.inOre} decimals={0} unit={false} />
                    </td>
                    <td className="text-right">
                      <Amount ore={m.outOre} decimals={0} unit={false} />
                    </td>
                    <td className="text-right">
                      <Amount ore={m.inOre - m.outOre} decimals={0} unit={false} colored />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </div>
      <h2 className="px-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Transaksjoner</h2>
      <TxList transactions={sorted} ctx={lookups} onSelect={setSelected} className="min-h-0 flex-1" />
      <TxDetail tx={selected} ctx={lookups} onClose={() => setSelected(null)} onOpen={openTx} />
      <CategoryPicker
        open={picker != null}
        onClose={() => setPicker(null)}
        categories={lookups.categories}
        groups={lookups.groups}
        onPick={(categoryId) => {
          const p = picker;
          setPicker(null);
          if (p) void mutate(() => setPersonDefault(db, personId, { direction: p.direction, accountId: p.accountId, categoryId }));
        }}
      />
    </div>
  );
}
