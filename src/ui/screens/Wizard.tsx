import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups } from '../hooks';
import { CAT } from '../../core/categories';
import { ROLE_LABELS } from '../../db/repo';
import type { AccountRole, Transaction } from '../../core/types';
import type { WizardPersonLine } from '../../workers/protocol';
import { Amount, Button, Card, Field, PageHeader, Spinner, inputClass } from '../components/basics';
import { CategoryPicker } from '../components/CategoryPicker';
import { confirmOneOff, markPersonReviewed, setCategory, setOneOff, setPersonDefault } from '../../db/actions';
import { formatDateShort } from '../../core/dates';

const PERSON_QUICK = [CAT.leieinntekt, CAT.deltHusholdning, CAT.gaverArv, CAT.gaverGitt, CAT.annet];
const ONE_OFF_QUICK = [CAT.boligkjop, CAT.investering, CAT.bil, CAT.gaverGitt, CAT.annet];

export function Wizard() {
  const { db, engine, mutate, updateSetting, busy } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const { data, loading } = useAsync(() => engine.wizard(), []);
  const [picker, setPicker] = useState<{ kind: 'person'; line: WizardPersonLine } | { kind: 'tx'; tx: Transaction; scope: 'this' | 'all' } | null>(null);

  const finish = async () => {
    await updateSetting('wizardDone', true);
    navigate('/');
  };

  if (!lookups || (loading && !data)) return <Spinner />;
  if (!data || data.accounts.length === 0) {
    return (
      <div>
        <PageHeader title="Oppsett" back={() => navigate(-1)} />
        <p className="p-4 text-slate-500">Importer først, så kan oppsettet kjøres.</p>
      </div>
    );
  }

  const steps = ['Kontoer', 'Personer', 'Store engangsposter', 'Ukjente butikker'];

  const quickPick = (line: WizardPersonLine, categoryId: string | null) =>
    mutate(async () => {
      if (categoryId) await setPersonDefault(db, line.personId, { direction: line.direction, accountId: line.accountId, categoryId });
      await markPersonReviewed(db, line.personId);
    });

  return (
    <div className="pb-6">
      <PageHeader title={`Oppsett ${step + 1}/${steps.length}: ${steps[step]}`} right={<Button variant="ghost" onClick={finish}>Hopp over</Button>} />
      <div className="space-y-3 p-4">
        {step === 0 && (
          <>
            <p className="text-sm text-slate-500">Gjenkjente kontoer. Rollen brukes til gruppering og ikoner.</p>
            {data.accounts.map((a) => (
              <Card key={a.id}>
                <Field label={`Navn (${a.number})`}>
                  <input
                    defaultValue={a.name}
                    className={inputClass}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== a.name) void mutate(() => db.accounts.update(a.id!, { name }).then(() => undefined), { reclassify: false });
                    }}
                  />
                </Field>
                <Field label="Rolle">
                  <select
                    defaultValue={a.role}
                    className={inputClass}
                    onChange={(e) => void mutate(() => db.accounts.update(a.id!, { role: e.target.value as AccountRole }).then(() => undefined), { reclassify: false })}
                  >
                    {(Object.keys(ROLE_LABELS) as AccountRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </Field>
              </Card>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-slate-500">Personer med minst 3 betalinger eller 5 000 kr. Velg kategori per linje; valget huskes. Nøkkelord i meldingen vinner fortsatt.</p>
            {data.personLines.length === 0 && <p className="text-slate-500">Ingen personer å sette opp.</p>}
            {data.personLines.map((line) => {
              const key = `${line.personId}-${line.direction}-${line.accountId}`;
              const current = line.currentCategoryId ? lookups.categories.get(line.currentCategoryId) : null;
              return (
                <Card key={key} testId="person-line">
                  <div className="font-medium">
                    {line.direction === 'in' ? `Fra ${line.personName} → ${line.accountName}` : `Til ${line.personName} (fra ${line.accountName})`}
                  </div>
                  <div className="text-sm text-slate-500">
                    {line.count} {line.count === 1 ? 'betaling' : 'betalinger'}, <Amount ore={line.sumOre} decimals={0} />
                    {current && <span className="ml-2 text-brand-700">→ {current.name}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PERSON_QUICK.map((id) => (
                      <Button key={id} size="sm" variant={line.currentCategoryId === id ? 'primary' : 'secondary'} onClick={() => quickPick(line, id)} disabled={busy}>
                        {lookups.categories.get(id)?.name}
                      </Button>
                    ))}
                    <Button size="sm" variant="secondary" onClick={() => setPicker({ kind: 'person', line })}>
                      Annen…
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => quickPick(line, null)}>
                      La stå
                    </Button>
                  </div>
                </Card>
              );
            })}
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-slate-500">Store poster flagges som engangs og holdes utenfor normalt forbruk. Bekreft eller fjern flagget, og velg kategori for uavklarte.</p>
            {data.oneOffs.length === 0 && <p className="text-slate-500">Ingen store engangsposter.</p>}
            {data.oneOffs.map((tx) => (
              <Card key={tx.id}>
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{tx.displayName || tx.description}</div>
                    <div className="text-sm text-slate-500">
                      {formatDateShort(tx.statDate)} · {lookups.categories.get(tx.categoryId)?.name}
                    </div>
                  </div>
                  <Amount ore={tx.amountOre} colored className="font-semibold" />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => mutate(() => confirmOneOff(db, tx.id!), { reclassify: false })} disabled={tx.oneOffConfirmed}>
                    {tx.oneOffConfirmed ? 'Bekreftet' : 'Bekreft engangs'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => mutate(() => setOneOff(db, tx.id!, false))}>
                    Ikke engangs
                  </Button>
                  {tx.categoryId === CAT.uavklart &&
                    ONE_OFF_QUICK.map((id) => (
                      <Button key={id} size="sm" variant="secondary" onClick={() => mutate(() => setCategory(db, tx.id!, id, 'this'))}>
                        {lookups.categories.get(id)?.name}
                      </Button>
                    ))}
                  <Button size="sm" variant="ghost" onClick={() => setPicker({ kind: 'tx', tx, scope: 'this' })}>
                    Annen kategori…
                  </Button>
                </div>
              </Card>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-slate-500">De hyppigste ukjente butikkene. Valget blir en lært kobling for alle kjøp fra samme butikk.</p>
            {data.unknownMerchants.length === 0 && <p className="text-slate-500">Ingen ukjente butikker. 🎉</p>}
            {data.unknownMerchants.map((u) => (
              <Card key={u.merchantKey}>
                <div className="flex justify-between">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-sm text-slate-500">
                    {u.count} kjøp · <Amount ore={u.sumOre} decimals={0} />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={async () => {
                    const tx = await db.transactions.get(u.sampleTxId);
                    if (tx) setPicker({ kind: 'tx', tx, scope: 'all' });
                  }}
                >
                  Velg kategori
                </Button>
              </Card>
            ))}
          </>
        )}

        <div className="flex gap-2 pt-2">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              Tilbake
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button full onClick={() => setStep(step + 1)} data-testid="wizard-next">
              Neste
            </Button>
          ) : (
            <Button full onClick={finish} data-testid="wizard-finish">
              Ferdig
            </Button>
          )}
        </div>
      </div>

      <CategoryPicker
        open={picker != null}
        onClose={() => setPicker(null)}
        categories={lookups.categories}
        groups={lookups.groups}
        quick={picker?.kind === 'person' ? PERSON_QUICK : ONE_OFF_QUICK}
        onPick={(id) => {
          const p = picker;
          setPicker(null);
          if (!p) return;
          if (p.kind === 'person') void quickPick(p.line, id);
          else void mutate(() => setCategory(db, p.tx.id!, id, p.scope));
        }}
      />
    </div>
  );
}
