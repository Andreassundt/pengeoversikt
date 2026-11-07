import { fold, isAccountOnlyDescription, prettyCase, stripAccountSuffix } from './text';

interface ProviderPrefix {
  re: RegExp;
  name: string;
}

/** Payment-provider prefixes that are stripped and kept as metadata ("via Vipps"). */
const PROVIDER_PREFIXES: ProviderPrefix[] = [
  { re: /^VIPPS\*\s*/i, name: 'Vipps' },
  { re: /^WL \*\s*/i, name: 'Worldline' },
  { re: /^WL\*\s*/i, name: 'Worldline' },
  { re: /^W\*\s*/i, name: 'Worldline' },
  { re: /^PAYPAL \*\s*/i, name: 'PayPal' },
  { re: /^PAYPAL_\*\s*/i, name: 'PayPal' },
  { re: /^PAYPAL\*\s*/i, name: 'PayPal' },
  { re: /^SP \s*/, name: 'Shopify' },
  { re: /^SQ \*\s*/i, name: 'Square' },
  { re: /^SUMUP \*\s*/i, name: 'SumUp' },
  { re: /^SUMUP\*\s*/i, name: 'SumUp' },
  { re: /^IZ \*\s*/i, name: 'iZettle' },
  { re: /^IZ\*\s*/i, name: 'iZettle' },
  { re: /^ZETTLE_\*\s*/i, name: 'Zettle' },
];

export function stripDatePrefix(s: string): string {
  return s.replace(/^\d{2}\.\d{2}\s+/, '');
}

export function stripProvider(s: string): { text: string; provider: string | null } {
  for (const p of PROVIDER_PREFIXES) {
    if (p.re.test(s)) return { text: s.replace(p.re, ''), provider: p.name };
  }
  return { text: s, provider: null };
}

/**
 * Removes noise: codes starting with "*" that contain a digit ("*AB12CD34", "**1122*"), and
 * tokens that are only digits/punctuation ("57800031", "1.888.858.2569", "539").
 */
export function stripNoise(s: string): string {
  const withoutStarCodes = s.replace(/\*+\S*\d\S*/g, ' ');
  return withoutStarCodes
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && !/^[\d.\-/:,]+$/.test(tok) && !/^\*+$/.test(tok))
    .join(' ')
    .trim();
}

export interface MerchantInput {
  cardMerchantText: string | null;
  description: string;
  counterpartyName: string;
  isCardPurchase: boolean;
}

export interface MerchantResult {
  provider: string | null;
  /** Folded text for dictionary matching: after date/provider prefix removal, before noise removal. */
  dictText: string;
  /** Cleaned text in original case. */
  merchantText: string;
  /** Folded, cleaned key used for learning and recurring detection. */
  merchantKey: string;
  /** Fallback display name when the dictionary has no canonical name. */
  fallbackName: string;
}

/** Computes merchant key, dictionary text and display fallback for a transaction (section 5.3). */
export function computeMerchant(input: MerchantInput): MerchantResult {
  let source: string;
  if (input.cardMerchantText) {
    source = input.cardMerchantText;
  } else if (input.isCardPurchase) {
    source = input.description;
  } else if (input.counterpartyName) {
    source = input.counterpartyName;
  } else {
    source = isAccountOnlyDescription(input.description) ? '' : stripAccountSuffix(input.description);
  }
  source = stripDatePrefix(source.trim());
  const { text, provider } = stripProvider(source);
  const dictText = fold(text);
  const cleaned = stripNoise(text);
  const merchantKey = fold(cleaned).replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    provider,
    dictText,
    merchantText: cleaned,
    merchantKey,
    fallbackName: prettyCase(cleaned.replace(/\*/g, ' ')),
  };
}
