import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { useLookups } from '../hooks';
import type { Rule, RuleCondition } from '../../core/types';
import { countRuleHits, deleteMerchantLink, deleteRule, saveRule } from '../../db/actions';
import { Button, Card, Field, PageHeader, Sheet, Spinner, Toggle, inputClass } from '../components/basics';
import { CategoryPicker } from '../components/CategoryPicker';
import { parseAmountNo, formatOre } from '../../core/money';

const EMPTY: Rule = { name: '', priority: 10, enabled: true, conditions: {}, categoryId: 'annet' };

export function Rules() {
  const { db, mutate } = useData();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Rule | null>(null);
  const { data: rules } = useAsync(() => db.rules.orderBy('priority').toArray(), [db]);
  const { data: links } = useAsync(() => db.merchantLinks.toArray(), [db]);

  if (!lookups || !rules || !links) return <Spinner />;

  const move = async (rule: Rule, delta: number) => {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((r) => r.id === rule.id);
    const other = sorted[idx + delta];
    if (!other) return;
    await mutate(async () => {
      await db.rules.update(rule.id!, { priority: other.priority });
      await db.rules.update(other.id!, { priority: rule.priority });
    });
  };

  return (
    <div>
      <PageHeader title="Regler" back={() => navigate('/mer')} right={<Button variant="ghost" onClick={() => setEditing({ ...EMPTY, priority: (rules.at(-1)?.priority ?? 0) + 10 })}>+ Ny</Button>} />
      <div className="space-y-3 p-4">
        <p className="text-sm text-slate-500">Reglene prøves i rekkefølge, etter de strukturelle reglene og før lærte koblinger og ordboken. Første treff vinner.</p>
        {rules.length === 0 && <p className="text-slate-500">Ingen regler ennå.</p>}
        {rules.map((r, i) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditing(r)} className="min-w-0 flex-1 text-left">
                <div className="font-medium">
                  {r.name || '(uten navn)'} {!r.enabled && <span className="text-xs text-slate-400">(av)</span>}
                </div>
                <div className="truncate text-sm text-slate-500">
                  {describe(r.conditions)} → {lookups.categories.get(r.categoryId)?.name}
                </div>
              </button>
              <button type="button" aria-label="Flytt opp" disabled={i === 0} onClick={() => move(r, -1)} className="h-10 w-10 rounded-full disabled:opacity-30">
                ↑
              </button>
              <button type="button" aria-label="Flytt ned" disabled={i === rules.length - 1} onClick={() => move(r, 1)} className="h-10 w-10 rounded-full disabled:opacity-30">
                ↓
              </button>
            </div>
          </Card>
        ))}

        <h2 className="pt-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Lærte koblinger ({links.length})</h2>
        {links.length === 0 && <p className="text-sm text-slate-500">Koblinger lages når du retter en kategori og svarer «Ja, alle lignende».</p>}
        {links.map((l) => (
          <Card key={l.merchantKey} className="flex items-center justify-between p-3 text-sm">
            <span>
              <span className="font-medium">{l.merchantKey}</span> → {lookups.categories.get(l.categoryId)?.name}
            </span>
            <Button size="sm" variant="ghost" onClick={() => mutate(() => deleteMerchantLink(db, l.merchantKey))}>
              Fjern
            </Button>
          </Card>
        ))}
      </div>
      {editing && (
        <RuleEditor
          rule={editing}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await mutate(() => saveRule(db, r).then(() => undefined));
            setEditing(null);
          }}
          onDelete={
            editing.id != null
              ? async () => {
                  await mutate(() => deleteRule(db, editing.id!));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function describe(c: RuleCondition): string {
  const parts: string[] = [];
  if (c.direction) parts.push(c.direction === 'in' ? 'inn' : 'ut');
  if (c.counterpartyNameContains) parts.push(`motpart «${c.counterpartyNameContains}»`);
  if (c.counterpartyAccount) parts.push(`konto ${c.counterpartyAccount}`);
  if (c.textContains) parts.push(`tekst «${c.textContains}»`);
  if (c.textRegex) parts.push(`tekst /${c.textRegex}/`);
  if (c.messageContains) parts.push(`melding «${c.messageContains}»`);
  if (c.messageRegex) parts.push(`melding /${c.messageRegex}/`);
  if (c.type) parts.push(`type ${c.type}`);
  if (c.subtype) parts.push(`undertype ${c.subtype}`);
  if (c.minAmountOre != null) parts.push(`≥ ${formatOre(c.minAmountOre, { unit: true })}`);
  if (c.maxAmountOre != null) parts.push(`≤ ${formatOre(c.maxAmountOre, { unit: true })}`);
  return parts.join(', ') || 'ingen betingelser';
}

function RuleEditor({
  rule,
  lookups,
  onClose,
  onSave,
  onDelete,
}: {
  rule: Rule;
  lookups: NonNullable<ReturnType<typeof useLookups>>;
  onClose: () => void;
  onSave: (r: Rule) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { db } = useData();
  const [draft, setDraft] = useState<Rule>(rule);
  const [picker, setPicker] = useState(false);
  const [hits, setHits] = useState<number | null>(null);
  const c = draft.conditions;
  const setCond = (patch: Partial<RuleCondition>) => {
    setHits(null);
    setDraft({ ...draft, conditions: { ...c, ...patch } });
  };
  const text = (key: keyof RuleCondition, label: string, placeholder?: string) => (
    <Field label={label}>
      <input
        value={(c[key] as string | undefined) ?? ''}
        placeholder={placeholder}
        onChange={(e) => setCond({ [key]: e.target.value || undefined })}
        className={inputClass}
      />
    </Field>
  );
  return (
    <Sheet open onClose={onClose} title={rule.id != null ? 'Rediger regel' : 'Ny regel'} tall>
      <Field label="Navn">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
      </Field>
      <Toggle checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="Aktiv" />
      <h3 className="mt-2 text-sm font-semibold text-slate-500">Betingelser (alle må stemme)</h3>
      <Field label="Retning">
        <select value={c.direction ?? ''} onChange={(e) => setCond({ direction: (e.target.value || undefined) as 'in' | 'out' | undefined })} className={inputClass}>
          <option value="">Begge</option>
          <option value="in">Inn</option>
          <option value="out">Ut</option>
        </select>
      </Field>
      <Field label="Egen konto">
        <select value={c.accountId ?? ''} onChange={(e) => setCond({ accountId: e.target.value ? Number(e.target.value) : undefined })} className={inputClass}>
          <option value="">Alle</option>
          {lookups.accountList.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      {text('counterpartyAccount', 'Motpartskonto', '1234 56 78901')}
      {text('counterpartyNameContains', 'Motpartsnavn inneholder')}
      {text('textContains', 'Tekst inneholder')}
      {text('textRegex', 'Tekst matcher regex', '^KIWI')}
      {text('messageContains', 'Melding inneholder')}
      {text('messageRegex', 'Melding matcher regex')}
      {text('type', 'Type', 'Varekjøp')}
      {text('subtype', 'Undertype', 'Varekjøp debetkort')}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Minste beløp (kr)">
          <input
            inputMode="decimal"
            defaultValue={c.minAmountOre != null ? formatOre(c.minAmountOre, { unit: false }) : ''}
            onBlur={(e) => setCond({ minAmountOre: parseAmountNo(e.target.value) ?? undefined })}
            className={inputClass}
          />
        </Field>
        <Field label="Største beløp (kr)">
          <input
            inputMode="decimal"
            defaultValue={c.maxAmountOre != null ? formatOre(c.maxAmountOre, { unit: false }) : ''}
            onBlur={(e) => setCond({ maxAmountOre: parseAmountNo(e.target.value) ?? undefined })}
            className={inputClass}
          />
        </Field>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-slate-500">Handling</h3>
      <button type="button" onClick={() => setPicker(true)} className="my-2 flex min-h-12 w-full items-center justify-between rounded-xl bg-slate-100 px-3 dark:bg-slate-800">
        <span>Kategori: {lookups.categories.get(draft.categoryId)?.name}</span>
        <span className="text-slate-400">Endre ›</span>
      </button>
      <Field label="Visningsnavn (valgfritt)">
        <input value={draft.displayName ?? ''} onChange={(e) => setDraft({ ...draft, displayName: e.target.value || undefined })} className={inputClass} />
      </Field>
      <Toggle
        checked={(draft.flags ?? []).includes('oneOff')}
        onChange={(v) => setDraft({ ...draft, flags: v ? ['oneOff'] : [] })}
        label="Flagg som engangs"
      />
      <div className="mt-3 flex flex-wrap gap-2 pb-2">
        <Button variant="secondary" onClick={async () => setHits(await countRuleHits(db, draft))}>
          Test regel{hits != null && `: ${hits} treff`}
        </Button>
        <Button onClick={() => onSave(draft)}>Lagre</Button>
        {onDelete && (
          <Button variant="danger" onClick={onDelete}>
            Slett
          </Button>
        )}
      </div>
      <CategoryPicker
        open={picker}
        onClose={() => setPicker(false)}
        categories={lookups.categories}
        groups={lookups.groups}
        current={draft.categoryId}
        onPick={(id) => {
          setDraft({ ...draft, categoryId: id });
          setPicker(false);
        }}
      />
    </Sheet>
  );
}
