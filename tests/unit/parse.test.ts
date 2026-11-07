import { describe, expect, it } from 'vitest';
import { EXPORT1_FILES, EXPORT2_FILE, parseFixture, readFixture } from './helpers';
import { parseFileText } from '../../src/core/parse';
import { RAW } from '../../src/core/types';
import { collectAccountNames, detectAccountNumber, detectOwner } from '../../src/core/accounts';
import { validateAgainstFooter } from '../../src/core/validate';
import { normalizeRow } from '../../src/core/normalize';
import { computeMerchant } from '../../src/core/merchant';

const ALL_FILES = [...EXPORT1_FILES, EXPORT2_FILE];

describe('bank format parsing', () => {
  it('reads all six files with BOM, embedded line breaks and footer', () => {
    const counts = ALL_FILES.map((f) => parseFixture(f).rows.length);
    expect(counts).toEqual([75, 5, 21, 6, 2, 43]);
    for (const f of ALL_FILES) {
      const parsed = parseFixture(f);
      expect(parsed.formatId).toBe('bank-no-v1');
      expect(parsed.warnings).toEqual([]);
      for (const row of parsed.rows) expect(row.fields).toHaveLength(15);
    }
  });

  it('keeps multi-line messages inside quotes', () => {
    const brukskonto = parseFixture(EXPORT1_FILES[0]!);
    const adyen = brukskonto.rows.find((r) => r.fields[RAW.description] === 'ADYEN N.V.')!;
    expect(adyen.fields[RAW.message]).toBe('FINNkode: 123456789 XNN00TESTKODE\nFINNkode123456789');
    const bolig = parseFixture(EXPORT1_FILES[2]!);
    const loan = bolig.rows.find((r) => r.fields[RAW.subtype] === 'Nedbetaling av lån')!;
    expect(loan.fields[RAW.message]!).toContain('Avdrag:');
    expect(loan.fields[RAW.message]!.split('\n')).toHaveLength(4);
  });

  it('reads the footer with hard spaces and comma decimals', () => {
    const f0 = parseFixture(EXPORT1_FILES[0]!).footer!;
    expect(f0).toEqual({
      totalInOre: 11654464,
      totalOutOre: -10296829,
      openingBalanceOre: 0,
      closingBalanceOre: 1357635,
      periodStart: '2025-11-07',
      periodEnd: '2026-11-07',
    });
    const f3 = parseFixture(EXPORT1_FILES[3]!).footer!;
    expect(f3.totalInOre).toBe(125020000);
    expect(f3.totalOutOre).toBe(-125000000);
    expect(f3.closingBalanceOre).toBe(0);
    const f2 = parseFixture(EXPORT2_FILE).footer!;
    expect(f2.openingBalanceOre).toBe(3082669);
    expect(f2.closingBalanceOre).toBe(1297695);
    expect(f2.periodStart).toBe('2026-10-12');
    expect(f2.periodEnd).toBe('2026-11-10');
  });

  it('reports unknown formats instead of crashing', () => {
    const res = parseFileText('Dato;Beløp;Tekst\n01.01.2026;-10,00;Noe\n', 'x.csv');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unknown-format');
    const empty = parseFileText('', 'tom.csv');
    expect(empty.ok).toBe(false);
  });

  it('tolerates unknown type/subtype combinations', () => {
    const text = readFixture(EXPORT1_FILES[4]!).replace('Overføring til egen konto', 'Noe helt nytt');
    const res = parseFileText(text, 'x.csv');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.file.rows.length).toBe(2);
  });
});

describe('account detection', () => {
  it('finds the account number of each file from the sign of the amount', () => {
    const numbers = ALL_FILES.map((f) => detectAccountNumber(parseFixture(f).rows).number);
    expect(numbers).toEqual([
      '1111 22 33001',
      '1111 22 33002',
      '1111 22 33003',
      '1111 22 33004',
      '1111 22 33005',
      '1111 22 33001',
    ]);
    for (const f of ALL_FILES) expect(detectAccountNumber(parseFixture(f).rows).warning).toBeNull();
  });

  it('finds account names from own-transfer rows across all files', () => {
    const names = new Map<string, string>();
    for (const f of EXPORT1_FILES) collectAccountNames(parseFixture(f).rows, names);
    expect(Object.fromEntries(names)).toEqual({
      '1111 22 33001': 'Brukskonto',
      '1111 22 33002': 'Lønn',
      '1111 22 33003': 'Bolig',
      '1111 22 33004': 'Sparing',
      '1111 22 33005': 'Forsikringer',
    });
  });

  it('finds the owner from card purchases and confirms with incoming payments', () => {
    const rows = EXPORT1_FILES.flatMap((f) => parseFixture(f).rows);
    const owner = detectOwner(rows);
    expect(owner.name).toBe('Ola Fiktiv Testesen');
    expect(owner.confirmed).toBe(true);
  });
});

describe('footer validation', () => {
  it('warns only for the Sparing file, with a 200 kr deviation', () => {
    const results = EXPORT1_FILES.map((f) => {
      const parsed = parseFixture(f);
      return validateAgainstFooter(parsed.rows, parsed.footer);
    });
    expect(results[0]!.warnings).toEqual([]);
    expect(results[1]!.warnings).toEqual([]);
    expect(results[2]!.warnings).toEqual([]);
    expect(results[4]!.warnings).toEqual([]);
    expect(results[3]!.warnings).toHaveLength(1);
    expect(results[3]!.warnings[0]!.replace(/ /g, ' ')).toContain('200,00 kr');
    const e2 = parseFixture(EXPORT2_FILE);
    expect(validateAgainstFooter(e2.rows, e2.footer).warnings).toEqual([]);
  });
});

describe('normalisation', () => {
  const brukskonto = parseFixture(EXPORT1_FILES[0]!);
  const row = (n: number) => normalizeRow(brukskonto.rows[n - 1]!.fields);

  it('parses card info with original currency and rate', () => {
    const okq8 = row(30);
    expect(okq8.amountOre).toBe(-52647);
    expect(okq8.card).toMatchObject({
      last4: '9876',
      purchaseDate: '2026-10-15',
      currency: 'SEK',
      amountMinor: 53523,
      rate: '0.9836',
      merchantText: 'OKQ8',
    });
    expect(okq8.statDate).toBe('2026-10-15');
  });

  it('takes the purchase date from the description prefix', () => {
    const rema = row(11);
    expect(rema.date).toBe('2026-11-02');
    expect(rema.purchaseDate).toBe('2026-10-31');
    expect(rema.statDate).toBe('2026-10-31');
    expect(rema.description).toBe('31.10 REMA STORGATA OSLO');
  });

  it('derives the counterparty from the direction', () => {
    const mia = row(5);
    expect(mia.direction).toBe('in');
    expect(mia.counterpartyAccount).toBe('2222 33 44001');
    expect(mia.counterpartyName).toBe('Mia Leietaker Hansen');
    const nordnet = row(2);
    expect(nordnet.counterpartyAccount).toBe('9750 00 00001');
    expect(nordnet.counterpartyName).toBe('NORDNET BANK AB');
    const reserved = row(3);
    expect(reserved.status).toBe('reserved');
    expect(reserved.counterpartyName).toBe('REMA STORGATA');
    const smaasparing = row(10);
    expect(smaasparing.counterpartyName).toBe('');
    expect(smaasparing.counterpartyAccount).toBe('1111 22 33004');
  });

  it('repairs 7-bit text in names and messages', () => {
    const sparing = parseFixture(EXPORT1_FILES[3]!);
    const borge = normalizeRow(sparing.rows[2]!.fields);
    expect(borge.counterpartyName).toBe('BØRGE TESTESEN');
    expect(borge.message).toBe('NETTBANK DATO 24.09.2026 KL. 17.18.02\nGave til boligkjøp på Bryn');
    const bolig = parseFixture(EXPORT1_FILES[2]!);
    const oppgjor = normalizeRow(bolig.rows[16]!.fields);
    expect(oppgjor.message).toBe('OPPGJØR AV KONTO');
  });
});

describe('merchant key', () => {
  const card = (text: string) =>
    computeMerchant({ cardMerchantText: text, description: text, counterpartyName: '', isCardPurchase: true });
  const desc = (text: string) =>
    computeMerchant({ cardMerchantText: null, description: text, counterpartyName: '', isCardPurchase: true });

  it('strips provider prefixes and keeps them as metadata', () => {
    expect(card('Vipps*ISS Facility Servic')).toMatchObject({ provider: 'Vipps', merchantKey: 'ISS FACILITY SERVIC' });
    expect(card('WL *STEAM PURCHASE')).toMatchObject({ provider: 'Worldline', merchantKey: 'STEAM PURCHASE' });
    expect(card('W*TEKNIKMAGASINET.N')).toMatchObject({ provider: 'Worldline', merchantKey: 'TEKNIKMAGASINET.N' });
    expect(card('PAYPAL *GOOGLE MACROFACTO')).toMatchObject({ provider: 'PayPal', merchantKey: 'GOOGLE MACROFACTO' });
    expect(card('PAYPAL_*TEST FYSIOTERAPI')).toMatchObject({ provider: 'PayPal', merchantText: 'TEST FYSIOTERAPI' });
    expect(card('OPENAI *CHATGPT SUBSCR').provider).toBeNull();
    expect(card('ANTHROPIC* CLAUDE SUB').provider).toBeNull();
    expect(card('GOOGLE *YouTubePremium').provider).toBeNull();
  });

  it('removes noise codes and numbers but keeps names', () => {
    expect(card('Revolut**1122*').merchantKey).toBe('REVOLUT');
    expect(card('Ad free for *QQ11RR22').merchantKey).toBe('AD FREE FOR');
    expect(card('GOOGLE *YouTubePremium').merchantKey).toBe('GOOGLE YOUTUBEPREMIUM');
    expect(card('GOOGLE*YOUTUBEPREMIUM').merchantKey).toBe('GOOGLE YOUTUBEPREMIUM');
    expect(card('25638077 Xyzzy Handel')).toMatchObject({ merchantKey: 'XYZZY HANDEL', fallbackName: 'Xyzzy Handel' });
    expect(card('McDonalds 57800031').merchantKey).toBe('MCDONALDS');
    expect(desc('05.10 BK 5006 STRØMME STØPERIVEIEN STRØMMEN').dictText).toBe('BK 5006 STROEMME STOEPERIVEIEN STROEMMEN');
    expect(desc('05.11 KID 47099 STORGATA 1 OSLO').merchantKey).toBe('KID STORGATA OSLO');
    expect(desc('03.10 204 JERNIA BRYN TVETENVEIEN OSLO').dictText).toBe('204 JERNIA BRYN TVETENVEIEN OSLO');
    expect(card('7-ELEVEN OSLO S').merchantKey).toBe('7-ELEVEN OSLO S');
    expect(card('1.888.858.2569 ACME').merchantKey).toBe('ACME');
  });
});
