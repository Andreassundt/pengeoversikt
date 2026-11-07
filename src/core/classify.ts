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
import { fold } from './text';
import { parseAmountNo } from './money';

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
    return {
      splits: null,
      warning: `Lånesplitten (${splits.length} deler) summerer ikke til radbeløpet.`,
    };
  }
  return { splits, warning: null };
}

const OWN_TRANSFER = 'OVERFOERING TIL EGEN KONTO';

/** Structural rules (priority 2): high-confidence classification from type/subtype/accounts. */
export function classifyStructural(tx: ClassifyInput, ctx: ClassifyContext): ClassifyResult | null {
  const subtype = fold(tx.subtype);
  const type = fold(tx.type);
  if (
    subtype === OWN_TRANSFER ||
    (tx.counterpartyAccount && ctx.myAccountNumbers.has(tx.counterpartyAccount)) ||
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
  return null;
}

/**
 * Classifies one transaction. Milestone 2 only has the structural rules and "Uavklart";
 * later milestones add rules, learned links, the dictionary, keywords, persons and heuristics.
 */
export function classify(tx: ClassifyInput, ctx: ClassifyContext): ClassifyResult {
  const structural = classifyStructural(tx, ctx);
  if (structural) return structural;
  return result(ctx, CAT.uavklart, 'none', 'lav');
}
