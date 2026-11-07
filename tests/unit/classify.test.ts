import { describe, expect, it } from 'vitest';
import { matchDictionary } from '../../src/core/dictionary';
import { compileKeyword, matchKeywords } from '../../src/core/keywords';
import { fold } from '../../src/core/text';
import { CAT } from '../../src/core/categories';
import { matchRule } from '../../src/core/rules';
import { normalizeRow } from '../../src/core/normalize';
import { RAW, type Rule } from '../../src/core/types';
import { parseLoanSplits } from '../../src/core/classify';

function row(overrides: Partial<Record<keyof typeof RAW, string>>): string[] {
  const f = new Array<string>(15).fill('');
  f[RAW.executedDate] = '01.10.2026';
  f[RAW.bookedDate] = '01.10.2026';
  f[RAW.status] = 'Bokført';
  f[RAW.currency] = 'NOK';
  for (const [k, v] of Object.entries(overrides)) f[RAW[k as keyof typeof RAW]] = v;
  return f;
}

describe('dictionary', () => {
  const cat = (text: string) => matchDictionary(fold(text))?.categoryId ?? null;
  const name = (text: string) => matchDictionary(fold(text))?.name ?? null;

  it('matches chains with canonical names', () => {
    expect(name('REMA STORGATA OSLO')).toBe('Rema 1000');
    expect(name('KID 47099 STORGATA 1 OSLO')).toBe('Kid Interiør');
    expect(name('204 JERNIA BRYN')).toBe('Jernia');
    expect(name('MCD 072 STORO')).toBe("McDonald's");
    expect(name('BK 5006 STRØMME')).toBe('Burger King');
    expect(name('GOOGLE *YouTubePremium')).toBe('YouTube Premium');
    expect(name('GOOGLE*YOUTUBEPREMIUM')).toBe('YouTube Premium');
    expect(name('Hoeoeks AS Oslo')).toBe('Hööks');
    expect(name('Elkjoep nettbutikk')).toBe('Elkjøp');
    expect(name('ELKJØP ALNA')).toBe('Elkjøp');
    expect(name('OPENAI *CHATGPT SUBSCR')).toBe('ChatGPT');
    expect(name('ANTHROPIC* CLAUDE SUB')).toBe('Claude');
    expect(name('GOOGLE MACROFACTO')).toBe('MacroFactor');
    expect(name('GOOGLE Google Play A')).toBe('Google Play');
    expect(name('Gebyr Vipps 36400000001')).toBe('Vipps-gebyr');
    expect(name('Ad free for *QQ11RR22')).toBe('Ad free for');
    expect(cat('EIENDOMSMEGLER TEST AS')).toBe(CAT.boligkjop);
  });

  it('avoids false hits', () => {
    expect(cat('ABNORMAL AS')).not.toBe(CAT.pleie);
    expect(cat('SPARING')).toBeNull();
    expect(cat('OBSERVATORIET')).toBeNull();
    expect(cat('VYKTIG BUTIKK')).toBeNull();
    expect(cat('ARKITEKTKONTORET')).toBeNull();
    expect(cat('MAX BURGERS OSLO')).toBe(CAT.matUte);
    expect(cat('MAX')).toBe(CAT.strommetjenester);
    expect(cat('XYZZY HANDEL')).toBeNull();
    expect(cat('EXPRESS BRYN TVETENVEIEN')).toBeNull();
    expect(cat('Mia Leietaker Hansen')).toBeNull();
    expect(cat('Kari Kasserer')).toBeNull();
    expect(cat('TESTBANKEN')).toBeNull();
    expect(name('APOTEK 1 STORGATA')).toBe('Apotek 1');
    expect(name('VITUSAPOTEK BRYN')).toBe('Vitusapotek');
    expect(name('BOOTS APOTEK')).toBe('Apotek');
    expect(cat('TEST FYSIOTERAPI')).toBe(CAT.helse);
  });
});

describe('keywords', () => {
  it('compiles length rules', () => {
    expect(compileKeyword('dekk').test('DEKER')).toBe(false);
    expect(compileKeyword('dekk').test('NYE DEK')).toBe(true);
    expect(compileKeyword('bil').test('BILET')).toBe(false);
    expect(compileKeyword('bil').test('TIL BIL')).toBe(true);
    expect(compileKeyword('mat*').test('MATSTROEM')).toBe(true);
    expect(compileKeyword('mat*').test('TOMAT')).toBe(false);
    expect(compileKeyword('strøm').test('MATSTROEM')).toBe(true);
  });

  it('matches messages after folding and collapsing repeats', () => {
    expect(matchKeywords('MaAaat', 'out')?.categoryId).toBe(CAT.dagligvarer);
    expect(matchKeywords('Foooooood', 'out')?.categoryId).toBe(CAT.dagligvarer);
    expect(matchKeywords('Siste mat i huset', 'in')?.categoryId).toBe(CAT.dagligvarer);
    expect(matchKeywords('Husleie', 'in')?.categoryId).toBe(CAT.leieinntekt);
    expect(matchKeywords('Husleie Mia Hansen', 'out')?.categoryId).toBe(CAT.husleie);
    expect(matchKeywords('Botkassa dekker bøter', 'out')).toMatchObject({ categoryId: CAT.sport, ambiguous: false });
    expect(matchKeywords('Risbolle', 'out')?.categoryId).toBe(CAT.matUte);
    expect(matchKeywords('Felleskostnader Oktober', 'out')?.categoryId).toBe(CAT.felleskostnader);
    expect(matchKeywords('Gave til boligkj|p p} Bryn', 'in')).toMatchObject({ categoryId: CAT.gaverArv, ambiguous: false });
    expect(matchKeywords('FINNkode: 123456789', 'in')?.categoryId).toBe(CAT.salg);
    expect(matchKeywords('FINNkode: 123456789', 'out')).toBeNull();
    expect(matchKeywords('Til: Mia Leietaker Hansen\nBudsjett september', 'out')?.categoryId).toBe(CAT.deltHusholdning);
    expect(matchKeywords('Tingtang', 'out')).toBeNull();
    expect(matchKeywords('.', 'in')).toBeNull();
  });

  it('marks ambiguous messages as low confidence and picks the first row', () => {
    const m = matchKeywords('Matstrøm', 'out');
    expect(m).toMatchObject({ categoryId: CAT.strom, ambiguous: true });
    expect(matchKeywords('Pass strøm', 'out')).toMatchObject({ categoryId: CAT.strom, ambiguous: false });
    expect(matchKeywords('Mat extra', 'out')).toMatchObject({ categoryId: CAT.dagligvarer, ambiguous: false });
  });
});

describe('rules', () => {
  const tx = normalizeRow(
    row({
      description: 'Kari Kasserer (44445566004)',
      type: 'Betaling innland',
      subtype: 'Innlandsbetaling',
      fromAccount: '1111 22 33001',
      senderName: 'Brukskonto',
      toAccount: '4444 55 66004',
      receiverName: 'Kari Kasserer',
      amountOut: '-6015',
      message: 'Felleskostnader Oktober',
    }),
  );
  const base: Rule = { name: 'r', priority: 1, enabled: true, conditions: {}, categoryId: CAT.felleskostnader };

  it('matches on counterparty, text, message, direction and amount', () => {
    expect(matchRule({ ...base, conditions: { counterpartyNameContains: 'kasserer' } }, tx)).toBe(true);
    expect(matchRule({ ...base, conditions: { counterpartyAccount: '44445566004' } }, tx)).toBe(true);
    expect(matchRule({ ...base, conditions: { messageContains: 'felleskost' } }, tx)).toBe(true);
    expect(matchRule({ ...base, conditions: { messageRegex: '^Felles' } }, tx)).toBe(true);
    expect(matchRule({ ...base, conditions: { direction: 'in' } }, tx)).toBe(false);
    expect(matchRule({ ...base, conditions: { minAmountOre: 500000, maxAmountOre: 700000 } }, tx)).toBe(true);
    expect(matchRule({ ...base, conditions: { minAmountOre: 700000 } }, tx)).toBe(false);
    expect(matchRule({ ...base, conditions: { subtype: 'Innlandsbetaling', textContains: 'kari' } }, tx)).toBe(true);
    expect(matchRule({ ...base, conditions: { textRegex: '[' } }, tx)).toBe(false);
  });
});

describe('loan splits', () => {
  it('splits the loan payment by the message and requires the sum to match', () => {
    const message = 'Til :11117700001\nAvdrag: kr 4.972,00\nRenter: kr 8.467,00\nTerminomkostninger: kr 70,00';
    const ok = parseLoanSplits(message, -1350900);
    expect(ok.splits).toEqual([
      { categoryId: CAT.avdrag, amountOre: -497200 },
      { categoryId: CAT.renter, amountOre: -846700 },
      { categoryId: CAT.gebyrer, amountOre: -7000 },
    ]);
    const bad = parseLoanSplits(message, -1350000);
    expect(bad.splits).toBeNull();
    expect(bad.warning).toBeTruthy();
  });
});
