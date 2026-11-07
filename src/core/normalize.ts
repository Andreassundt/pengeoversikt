import { RAW, type CardInfo, type NormalizedFields } from './types';
import { parseAmountDot } from './money';
import { parseNoDate, resolvePurchaseDate } from './dates';
import {
  cleanMessage,
  cleanSpaces,
  fixSevenBit,
  fold,
  isAccountOnlyDescription,
  normalizeAccountNumber,
  stripAccountSuffix,
} from './text';
import { computeMerchant } from './merchant';

const CARD_RE = /^\*(\d{4}) (\d{2}\.\d{2}) ([A-Z]{3}) ([\d.]+) (.*?) Kurs: ([\d.]+)$/;
const DESC_DATE_RE = /^(\d{2}\.\d{2})\s/;

/** Parses card info from a message like "*9876 15.10 SEK 535.23 OKQ8 Kurs: 0.9836". */
export function parseCardInfo(message: string, executedIso: string): CardInfo | null {
  const line = message.replace(/\s+/g, ' ').trim();
  const m = CARD_RE.exec(line);
  if (!m) return null;
  const purchaseDate = resolvePurchaseDate(m[2]!, executedIso) ?? executedIso;
  return {
    last4: m[1]!,
    purchaseDate,
    currency: m[3]!,
    amountMinor: parseAmountDot(m[4]!) ?? 0,
    amountText: m[4]!,
    merchantText: m[5]!.trim(),
    rate: m[6]!,
  };
}

/** Derives all normalised fields from one canonical raw row. */
export function normalizeRow(fields: string[]): NormalizedFields {
  const f = (i: number): string => fields[i] ?? '';
  const date = parseNoDate(f(RAW.executedDate)) ?? parseNoDate(f(RAW.bookedDate)) ?? '1970-01-01';
  const bookedDate = parseNoDate(f(RAW.bookedDate));
  const status = fold(f(RAW.status)) === 'RESERVERT' ? 'reserved' : 'booked';
  const amountOre = (parseAmountDot(f(RAW.amountIn)) ?? 0) + (parseAmountDot(f(RAW.amountOut)) ?? 0);
  const direction = amountOre >= 0 ? 'in' : 'out';
  const type = cleanSpaces(f(RAW.type));
  const subtype = cleanSpaces(f(RAW.subtype));
  const description = fixSevenBit(cleanSpaces(f(RAW.description)));
  const message = fixSevenBit(cleanMessage(f(RAW.message)));
  const counterpartyAccount = normalizeAccountNumber(direction === 'in' ? f(RAW.fromAccount) : f(RAW.toAccount));
  let cpName = cleanSpaces(direction === 'in' ? f(RAW.senderName) : f(RAW.receiverName));
  if (!cpName) cpName = isAccountOnlyDescription(description) ? '' : stripAccountSuffix(description);
  const counterpartyName = fixSevenBit(cpName);
  const card = parseCardInfo(message, date);
  const isCardPurchase = fold(type) === 'VAREKJOEP';
  let purchaseDate: string | null = card?.purchaseDate ?? null;
  if (!purchaseDate) {
    const m = DESC_DATE_RE.exec(description);
    if (m) purchaseDate = resolvePurchaseDate(m[1]!, date);
  }
  const statDate = purchaseDate ?? date;
  const merchant = computeMerchant({
    cardMerchantText: card?.merchantText ?? null,
    description,
    counterpartyName,
    isCardPurchase,
  });
  return {
    status,
    date,
    bookedDate,
    purchaseDate,
    statDate,
    amountOre,
    direction,
    type,
    subtype,
    description,
    message,
    counterpartyAccount,
    counterpartyName,
    counterpartyNameFolded: fold(counterpartyName),
    card,
    isCardPurchase,
    provider: merchant.provider,
    dictText: merchant.dictText,
    merchantText: merchant.merchantText,
    merchantKey: merchant.merchantKey,
    merchantName: merchant.fallbackName,
  };
}
