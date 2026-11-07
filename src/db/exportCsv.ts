import type { PengeDb } from './schema';
import { entriesOf } from '../core/aggregate';
import { formatDateNo } from '../core/dates';

function csvField(s: string | number): string {
  const t = String(s);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Semicolon-separated CSV with BOM (opens directly in Norwegian Excel). Amounts use comma decimals. */
export async function exportTransactionsCsv(db: PengeDb): Promise<string> {
  const [txs, accounts, categories, groups, persons] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.groups.toArray(),
    db.persons.toArray(),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id!, a.name]));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const personName = new Map(persons.map((p) => [p.id!, p.displayName]));
  txs.sort((a, b) => (a.statDate < b.statDate ? 1 : a.statDate > b.statDate ? -1 : 0));
  const header = [
    'Statistikkdato',
    'Utført dato',
    'Kjøpsdato',
    'Konto',
    'Navn',
    'Beskrivelse',
    'Melding',
    'Motpart',
    'Motpartskonto',
    'Person',
    'Gruppe',
    'Kategori',
    'Art',
    'Beløp',
    'Valuta',
    'Originalbeløp',
    'Status',
    'Flagg',
    'Notat',
    'Merkelapper',
    'Splitt',
  ];
  const lines = [header.join(';')];
  const ore = (n: number) => {
    const abs = Math.abs(n);
    return `${n < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  };
  for (const tx of txs) {
    const entries = entriesOf(tx);
    for (const e of entries) {
      const cat = catMap.get(e.categoryId);
      lines.push(
        [
          formatDateNo(tx.statDate),
          formatDateNo(tx.date),
          tx.purchaseDate ? formatDateNo(tx.purchaseDate) : '',
          accountName.get(tx.accountId) ?? '',
          tx.displayName,
          tx.description,
          tx.message.replace(/\n/g, ' '),
          tx.counterpartyName,
          tx.counterpartyAccount,
          tx.personId != null ? (personName.get(tx.personId) ?? '') : '',
          groupName.get(cat?.groupId ?? '') ?? '',
          cat?.name ?? e.categoryId,
          cat?.kind ?? tx.kind,
          ore(e.amountOre),
          'NOK',
          tx.card && tx.card.currency !== 'NOK' ? `${tx.card.currency} ${ore(tx.card.amountMinor)}` : '',
          tx.status === 'reserved' ? 'Reservert' : 'Bokført',
          tx.flags.join(','),
          tx.note,
          tx.tags.join(','),
          entries.length > 1 ? 'ja' : '',
        ]
          .map(csvField)
          .join(';'),
      );
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
