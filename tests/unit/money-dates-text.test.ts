import { describe, expect, it } from 'vitest';
import { formatOre, parseAmountDot, parseAmountNo } from '../../src/core/money';
import { addMonths, daysBetween, formatDateShort, monthEnd, parseNoDate, resolvePurchaseDate } from '../../src/core/dates';
import {
  collapseRepeats,
  fixSevenBit,
  fold,
  looksLikeCompany,
  normalizeAccountNumber,
  prettyCase,
  stripAccountSuffix,
} from '../../src/core/text';
import { plain } from './helpers';

describe('money', () => {
  it('parses row amounts with dot decimals into øre without floats', () => {
    expect(parseAmountDot('8968.79')).toBe(896879);
    expect(parseAmountDot('-53.5')).toBe(-5350);
    expect(parseAmountDot('1500')).toBe(150000);
    expect(parseAmountDot('0.07')).toBe(7);
    expect(parseAmountDot('')).toBeNull();
    expect(parseAmountDot('abc')).toBeNull();
  });

  it('parses footer amounts with comma decimals and hard spaces', () => {
    expect(parseAmountNo('1 250 200,00 NOK')).toBe(125020000);
    expect(parseAmountNo('-40 500,00 NOK')).toBe(-4050000);
    expect(parseAmountNo('41 500,00 NOK')).toBe(4150000);
    expect(parseAmountNo('0,00 NOK')).toBe(0);
    expect(parseAmountNo('kr         4.972,00')).toBe(497200);
    expect(parseAmountNo('kr 70,00')).toBe(7000);
  });

  it('formats øre in Norwegian', () => {
    expect(plain(formatOre(123450))).toBe('1 234,50');
    expect(plain(formatOre(-5350, { unit: true }))).toBe('−53,50 kr');
    expect(plain(formatOre(6187887))).toBe('61 878,87');
    expect(plain(formatOre(0))).toBe('0,00');
    expect(plain(formatOre(-1360057))).toBe('−13 600,57');
    expect(plain(formatOre(100000, { decimals: 0 }))).toBe('1 000');
  });
});

describe('dates', () => {
  it('parses dd.mm.yyyy', () => {
    expect(parseNoDate('06.11.2026')).toBe('2026-11-06');
    expect(parseNoDate('')).toBeNull();
    expect(parseNoDate('31.02.2026')).toBeNull();
  });

  it('resolves purchase dates with the year of the executed date', () => {
    expect(resolvePurchaseDate('31.10', '2026-11-02')).toBe('2026-10-31');
    expect(resolvePurchaseDate('31.12', '2027-01-02')).toBe('2026-12-31');
    expect(resolvePurchaseDate('15.10', '2026-10-19')).toBe('2026-10-15');
  });

  it('does month arithmetic', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1);
    expect(formatDateShort('2026-11-06')).toBe('6. nov.');
  });
});

describe('text', () => {
  it('repairs 7-bit characters', () => {
    expect(fixSevenBit('B@RGE TESTESEN')).toBe('BØRGE TESTESEN');
    expect(fixSevenBit('Gave til boligkj|p p} Bryn')).toBe('Gave til boligkjøp på Bryn');
    expect(fixSevenBit('OPPGJ@R AV KONTO')).toBe('OPPGJØR AV KONTO');
    expect(fixSevenBit('ola@example.com')).toBe('ola@example.com');
    expect(fixSevenBit('OLA@EXAMPLE.COM')).toBe('OLA@EXAMPLE.COM');
    expect(fixSevenBit('a | b')).toBe('a | b');
  });

  it('folds for matching', () => {
    expect(fold('ELKJØP')).toBe('ELKJOEP');
    expect(fold('Elkjoep')).toBe('ELKJOEP');
    expect(fold('HÖÖKS')).toBe(fold('Hoeoeks'));
    expect(fold('  Blå   bær ')).toBe('BLAA BAER');
    expect(fold(fixSevenBit('B@RGE TESTESEN'))).toBe(fold('Børge Testesen'));
  });

  it('collapses repeats and pretty-cases', () => {
    expect(collapseRepeats('MAAAAT')).toBe('MAT');
    expect(collapseRepeats(fold('Foooooood'))).toBe('FOD');
    expect(prettyCase('TEST FYSIOTERAPI')).toBe('Test Fysioterapi');
    expect(prettyCase('Xyzzy Handel')).toBe('Xyzzy Handel');
    expect(prettyCase('LYSE TELE AS')).toBe('Lyse Tele AS');
  });

  it('normalises account numbers', () => {
    expect(normalizeAccountNumber('11117700001')).toBe('1111 77 00001');
    expect(normalizeAccountNumber('1111.22.33001')).toBe('1111 22 33001');
    expect(normalizeAccountNumber('1111 22 33001')).toBe('1111 22 33001');
    expect(normalizeAccountNumber('')).toBe('');
    expect(stripAccountSuffix('Mia Leietaker Hansen (22223344001)')).toBe('Mia Leietaker Hansen');
  });

  it('recognises companies', () => {
    expect(looksLikeCompany(fold('Lyse Tele AS'))).toBe(true);
    expect(looksLikeCompany(fold('ADYEN N.V.'))).toBe(true);
    expect(looksLikeCompany(fold('Testbanken'))).toBe(true);
    expect(looksLikeCompany(fold('NORDNET  BANK AB'))).toBe(true);
    expect(looksLikeCompany(fold('Mia Leietaker Hansen'))).toBe(false);
    expect(looksLikeCompany(fold('Kari Kasserer'))).toBe(false);
  });
});
