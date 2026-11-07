import { CAT } from './categories';
import type {
  Category,
  Confidence,
  Kind,
  MerchantLink,
  NormalizedFields,
  Person,
  Rule,
  Source,
  Split,
} from './types';
import { fold, normalizeForKeywords, stripAccountSuffix } from './text';
import { parseAmountNo } from './money';
import { hasSubscriptionHint, matchDictionary, type DictMatch } from './dictionary';
import { matchKeywords } from './keywords';
import { matchRule, ruleHasConditions } from './rules';
import { stripDatePrefix } from './merchant';

export interface ClassifyInput extends NormalizedFields {
  /** My account that the row belongs to (may be undefined for rows of a brand-new account). */
  accountId?: number;
  accountNumber: string;
}

export interface ClassifyContext {
  myAccountNumbers: Set<string>;
  ownerFolded: string;
  categories: Map<string, Category>;
  rules: Rule[];
  links: Map<string, MerchantLink>;
  findPerson: (counterpartyAccount: string, nameFolded: string) => Person | null;
}

export interface ClassifyResult {
  categoryId: string;
  kind: Kind;
  source: Source;
  confidence: Confidence;
  /** Canonical name from the dictionary, a rule or a learned link. */
  displayName: string | null;
  splits: Split[] | null;
  fastHint: boolean;
  warnings: string[];
}

export function emptyContext(categories: Map<string, Category>): ClassifyContext {
  return {
    myAccountNumbers: new Set(),
    ownerFolded: '',
    categories,
    rules: [],
    links: new Map(),
    findPerson: () => null,
  };
}

function kindOf(ctx: ClassifyContext, categoryId: string): Kind {
  return ctx.categories.get(categoryId)?.kind ?? 'unknown';
}

function result(
  ctx: ClassifyContext,
  categoryId: string,
  source: Source,
  confidence: Confidence,
  extra: Partial<ClassifyResult> = {},
): ClassifyResult {
  return {
    categoryId,
    kind: kindOf(ctx, categoryId),
    source,
    confidence,
    displayName: null,
    splits: null,
    fastHint: false,
    warnings: [],
    ...extra,
  };
}

/** Parses "Avdrag: kr 4.972,00 / Renter: … / Terminomkostninger: …" into splits. */
export function parseLoanSplits(message: string, amountOre: number): { splits: Split[] | null; warning: string | null } {
  const map: Array<[RegExp, string]> = [
    [/AVDRAG/, CAT.avdrag],
    [/RENTER/, CAT.renter],
    [/TERMINOMKOSTNING|GEBYR|OMKOSTNING/, CAT.gebyrer],
  ];
  const splits: Split[] = [];
  for (const line of message.split('\n')) {
    const m = /^([^:]+):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const label = fold(m[1]!);
    const target = map.find(([re]) => re.test(label));
    if (!target) continue;
    const value = parseAmountNo(m[2]!);
    if (value == null) continue;
    splits.push({ categoryId: target[1], amountOre: amountOre < 0 ? -value : value });
  }
  if (splits.length === 0) return { splits: null, warning: null };
  const sum = splits.reduce((a, s) => a + s.amountOre, 0);
  if (sum !== amountOre) {
    return { splits: null, warning: `Lånesplitten (${splits.length} deler) summerer ikke til radbeløpet.` };
  }
  return { splits, warning: null };
}

const OWN_TRANSFER = 'OVERFOERING TIL EGEN KONTO';
const KREDIT = 'KREDITOVERFOERING';
const UBETJENT = 'VAREKJOEP UBETJENT';
const DEBETKORT = 'VAREKJOEP DEBETKORT';

/** Dictionary texts to try for a transaction: merchant text for card rows, name and description otherwise. */
export function dictionaryTexts(tx: NormalizedFields): string[] {
  if (tx.isCardPurchase || tx.card) return [tx.dictText];
  const texts: string[] = [];
  if (tx.counterpartyNameFolded) texts.push(tx.counterpartyNameFolded);
  const desc = fold(stripDatePrefix(stripAccountSuffix(tx.description)));
  if (desc && !texts.includes(desc)) texts.push(desc);
  return texts;
}

export function lookupDictionary(tx: NormalizedFields): DictMatch | null {
  for (const text of dictionaryTexts(tx)) {
    const hit = matchDictionary(text);
    if (hit) return hit;
  }
  return null;
}

function fastHintFor(tx: NormalizedFields, hit: DictMatch | null): boolean {
  if (hit?.fast) return true;
  return hasSubscriptionHint(tx.dictText) || hasSubscriptionHint(tx.counterpartyNameFolded);
}

function applyFuelRule(ctx: ClassifyContext, tx: ClassifyInput, hit: DictMatch): ClassifyResult {
  const subtype = fold(tx.subtype);
  const abs = Math.abs(tx.amountOre);
  if (subtype === UBETJENT) return result(ctx, CAT.drivstoff, 'dictionary', 'høy', { displayName: hit.name });
  if (subtype === DEBETKORT && abs < 150_00) return result(ctx, CAT.matUte, 'dictionary', 'lav', { displayName: hit.name });
  return result(ctx, CAT.drivstoff, 'dictionary', 'middels', { displayName: hit.name });
}

/** Structural rules (priority 2): high-confidence classification from type/subtype/accounts. */
export function classifyStructural(tx: ClassifyInput, ctx: ClassifyContext): ClassifyResult | null {
  const subtype = fold(tx.subtype);
  const type = fold(tx.type);
  if (
    subtype === OWN_TRANSFER ||
    (tx.counterpartyAccount !== '' && ctx.myAccountNumbers.has(tx.counterpartyAccount)) ||
    type.endsWith('SMAASPARING')
  ) {
    return result(ctx, CAT.intern, 'structural', 'høy');
  }
  if (ctx.ownerFolded && tx.counterpartyNameFolded && tx.counterpartyNameFolded === ctx.ownerFolded) {
    return result(ctx, CAT.egenAnnenBank, 'structural', 'høy');
  }
  if (type === 'LOENN') {
    return result(ctx, subtype === 'PENSJON' ? CAT.nav : CAT.lonn, 'structural', 'høy');
  }
  if (subtype === 'NEDBETALING AV LAAN') {
    const { splits, warning } = parseLoanSplits(tx.message, tx.amountOre);
    if (splits) {
      const biggest = [...splits].sort((a, b) => Math.abs(b.amountOre) - Math.abs(a.amountOre))[0]!;
      return result(ctx, biggest.categoryId, 'structural', 'høy', { splits });
    }
    return result(ctx, CAT.renter, 'structural', 'middels', { warnings: warning ? [warning] : [] });
  }
  if (subtype === 'OMKOSTNINGER') {
    return result(ctx, CAT.gebyrer, 'structural', 'høy');
  }
  if (subtype === KREDIT) {
    // Refund to the card. The post-processing step links it to the purchase and copies that
    // category; until then the merchant text from the message is classified via the dictionary.
    const hit = matchDictionary(tx.dictText);
    if (hit) return result(ctx, hit.categoryId, 'structural', 'middels', { displayName: hit.name, fastHint: hit.fast });
    return result(ctx, CAT.uavklart, 'structural', 'lav');
  }
  return null;
}

/** Classifies one transaction (section 7). Manual categories are handled by the caller. */
export function classify(tx: ClassifyInput, ctx: ClassifyContext): ClassifyResult {
  const structural = classifyStructural(tx, ctx);
  if (structural) return structural;

  const hit = lookupDictionary(tx);
  const fastHint = fastHintFor(tx, hit);

  // 3. Explicit user rules, in priority order.
  for (const rule of ctx.rules) {
    if (!rule.enabled || !ruleHasConditions(rule)) continue;
    if (matchRule(rule, tx)) {
      return result(ctx, rule.categoryId, 'rule', 'høy', { displayName: rule.displayName ?? hit?.name ?? null, fastHint });
    }
  }

  // 4. Learned merchant links.
  const link = tx.merchantKey ? ctx.links.get(tx.merchantKey) : undefined;
  if (link) {
    return result(ctx, link.categoryId, 'learned', 'høy', { displayName: link.displayName ?? hit?.name ?? null, fastHint });
  }

  // 5. Dictionary.
  if (hit) {
    if (hit.fuel) return { ...applyFuelRule(ctx, tx, hit), fastHint };
    return result(ctx, hit.categoryId, 'dictionary', 'høy', { displayName: hit.name, fastHint });
  }

  // 6. Message keywords (payments to/from persons and others, never card purchases).
  if (!tx.isCardPurchase && tx.message) {
    const kw = matchKeywords(tx.message, tx.direction);
    if (kw) return result(ctx, kw.categoryId, 'keyword', kw.ambiguous ? 'lav' : 'høy', { fastHint });
  }

  // 7. Person default from the setup wizard.
  const person = ctx.findPerson(tx.counterpartyAccount, tx.counterpartyNameFolded);
  if (person) {
    const def = person.defaults.find(
      (d) => d.direction === tx.direction && (d.accountId == null || d.accountId === tx.accountId),
    );
    if (def) return result(ctx, def.categoryId, 'person', 'middels', { fastHint });
  }

  // 8. Heuristics.
  if (fold(tx.subtype) === UBETJENT && Math.abs(tx.amountOre) >= 200_00) {
    return result(ctx, CAT.drivstoff, 'heuristic', 'lav', { fastHint });
  }
  if (tx.direction === 'in' && /ADYEN/.test(tx.counterpartyNameFolded) && /FINKODE/.test(normalizeForKeywords(tx.message))) {
    return result(ctx, CAT.salg, 'heuristic', 'middels', { fastHint });
  }

  // 9. Unknown.
  return result(ctx, CAT.uavklart, 'none', 'lav', { fastHint });
}
