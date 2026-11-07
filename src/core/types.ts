/** Canonical raw field layout (15 columns, same order as the bank export). */
export const RAW = {
  executedDate: 0,
  bookedDate: 1,
  interestDate: 2,
  description: 3,
  type: 4,
  subtype: 5,
  fromAccount: 6,
  senderName: 7,
  toAccount: 8,
  receiverName: 9,
  amountIn: 10,
  amountOut: 11,
  currency: 12,
  status: 13,
  message: 14,
} as const;

export const RAW_FIELD_COUNT = 15;

export interface RawRow {
  /** Exactly 15 fields in canonical order. */
  fields: string[];
  /** 1-based row number among transaction rows (1 = first row under the header). */
  rowNumber: number;
}

export interface Footer {
  totalInOre: number | null;
  totalOutOre: number | null;
  openingBalanceOre: number | null;
  closingBalanceOre: number | null;
  /** ISO dates (yyyy-mm-dd). */
  periodStart: string | null;
  periodEnd: string | null;
}

export interface ParsedFile {
  fileName: string;
  formatId: string;
  header: string[];
  rows: RawRow[];
  footer: Footer | null;
  warnings: string[];
}

export type TxStatus = 'booked' | 'reserved';
export type Direction = 'in' | 'out';
export type Kind = 'income' | 'expense' | 'saving' | 'transfer' | 'unknown';
export type Confidence = 'høy' | 'middels' | 'lav';
export type Source =
  | 'manual'
  | 'structural'
  | 'rule'
  | 'learned'
  | 'dictionary'
  | 'keyword'
  | 'person'
  | 'heuristic'
  | 'none';

export type Flag = 'recurring' | 'possibleDouble' | 'refunded' | 'refund' | 'oneOff' | 'lowConfidence';

export interface CardInfo {
  last4: string;
  /** ISO date resolved with the year of the executed date. */
  purchaseDate: string;
  currency: string;
  /** Amount in minor units of the original currency. */
  amountMinor: number;
  amountText: string;
  merchantText: string;
  rate: string;
}

export interface Split {
  categoryId: string;
  amountOre: number;
  note?: string;
}

/** Fields derived purely from one raw row (no classification). */
export interface NormalizedFields {
  status: TxStatus;
  date: string;
  bookedDate: string | null;
  purchaseDate: string | null;
  statDate: string;
  amountOre: number;
  direction: Direction;
  type: string;
  subtype: string;
  description: string;
  message: string;
  counterpartyAccount: string;
  counterpartyName: string;
  counterpartyNameFolded: string;
  card: CardInfo | null;
  isCardPurchase: boolean;
  provider: string | null;
  /** Folded merchant text used for dictionary matching (numbers kept). */
  dictText: string;
  /** Cleaned merchant text (original case, noise removed). */
  merchantText: string;
  merchantKey: string;
  /** Pretty-cased fallback display name derived from the merchant text. */
  merchantName: string;
}

export interface Transaction extends NormalizedFields {
  id?: number;
  accountId: number;
  importId: number;
  raw: string[];
  dedupeKey: string;
  /** Canonical name from the dictionary, a rule or a learned link (null = none). */
  canonicalName: string | null;
  /** Effective display name (canonical name, person name or merchant text). */
  displayName: string;
  categoryId: string;
  kind: Kind;
  source: Source;
  confidence: Confidence;
  manual: boolean;
  splits: Split[] | null;
  flags: Flag[];
  /** Whether the dictionary or text says this is a known subscription / fixed bill. */
  fastHint: boolean;
  linkedTxId: number | null;
  pairTxId: number | null;
  recurringKey: string | null;
  personId: number | null;
  /** User override for the one-off flag: null = automatic. */
  oneOffOverride: 'on' | 'off' | null;
  oneOffConfirmed: boolean;
  doubleDismissed: boolean;
  note: string;
  tags: string[];
}

export type AccountRole = 'brukskonto' | 'lonn' | 'buffer' | 'sparing' | 'bolig' | 'forsikring' | 'annet';

export interface Account {
  id?: number;
  number: string;
  name: string;
  role: AccountRole;
  balanceOre: number;
  balanceDate: string | null;
  lastImportEnd: string | null;
  lastImportAt: string | null;
  hidden: boolean;
}

export interface Category {
  id: string;
  name: string;
  groupId: string;
  kind: Kind;
  color?: string;
  icon?: string;
  hidden: boolean;
  order: number;
}

export interface CategoryGroup {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface RuleCondition {
  direction?: Direction;
  accountId?: number;
  counterpartyAccount?: string;
  counterpartyNameContains?: string;
  textContains?: string;
  textRegex?: string;
  messageContains?: string;
  messageRegex?: string;
  type?: string;
  subtype?: string;
  minAmountOre?: number;
  maxAmountOre?: number;
}

export interface Rule {
  id?: number;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: RuleCondition;
  categoryId: string;
  flags?: Flag[];
  displayName?: string;
}

export interface MerchantLink {
  merchantKey: string;
  categoryId: string;
  displayName?: string;
  createdAt: string;
}

export interface PersonDefault {
  direction: Direction;
  /** null = any of my accounts. */
  accountId: number | null;
  categoryId: string;
}

export interface Person {
  id?: number;
  displayName: string;
  nameFolded: string;
  aliases: string[];
  accountNumbers: string[];
  role: string;
  defaults: PersonDefault[];
  reviewed: boolean;
  /** Folded names that must never be auto-merged into this person again. */
  noMerge: string[];
}

export interface ColumnMapping {
  date: number;
  amount?: number;
  amountIn?: number;
  amountOut?: number;
  text: number;
  message?: number;
  counterpartyAccount?: number;
  counterpartyName?: number;
  decimal: ',' | '.';
}

export interface FormatProfile {
  signature: string;
  name: string;
  mapping: ColumnMapping;
  createdAt: string;
}

export interface ImportRecord {
  id?: number;
  /** Files imported together share a batch id (used by undo). */
  batchId: string;
  fileName: string;
  accountId: number;
  accountNumber: string;
  periodStart: string | null;
  periodEnd: string | null;
  importedAt: string;
  rowCount: number;
  newBooked: number;
  duplicates: number;
  reservedAdded: number;
  reservedRemoved: number;
  reservedSkipped: number;
  warnings: string[];
  warningsAcknowledged: boolean;
  needsReview: number;
  /** For undo. */
  insertedTxIds: number[];
  removedReserved: Transaction[];
  previousAccount: Pick<Account, 'balanceOre' | 'balanceDate' | 'lastImportEnd' | 'lastImportAt'> | null;
  accountCreated: boolean;
  undone: boolean;
}

export type RecurringInterval = 'monthly' | 'weekly' | 'yearly' | null;

export interface RecurringGroup {
  key: string;
  name: string;
  categoryId: string;
  currency: string;
  /** Last amount in the original currency's minor units. */
  amountMinor: number;
  /** Last amount in øre (positive). */
  amountOre: number;
  /** Estimated monthly cost in øre. */
  monthlyOre: number;
  interval: RecurringInterval;
  lastDate: string;
  nextDate: string | null;
  count: number;
  isNew: boolean;
  stopped: boolean;
  priceChange: boolean;
  possibleDouble: boolean;
  fast: boolean;
  txIds: number[];
}

export interface SettingRow {
  key: string;
  value: unknown;
}
