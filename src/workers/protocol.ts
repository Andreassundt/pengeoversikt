import type { BalancePoint, CategoryTotal, FixedVariable, MerchantTotal, MonthPoint, PeriodSummary } from '../core/aggregate';
import type { Account, ImportRecord, Person, RecurringGroup, Transaction } from '../core/types';

export type EngineRequest =
  | { type: 'reclassify'; today: string }
  | { type: 'invalidate' }
  | { type: 'overview'; month: string; today: string }
  | { type: 'statistics'; from: string; to: string; months: string[] }
  | { type: 'recurring'; today: string }
  | { type: 'balanceHistory'; accountId: number | null; from: string; to: string }
  | { type: 'review' }
  | { type: 'personStats'; personId: number; months: string[] }
  | { type: 'wizard' };

export interface ReclassifyResponse {
  changed: number;
  written: number;
  total: number;
}

export interface OverviewResponse {
  month: string;
  summary: PeriodSummary;
  /** Average normal expense of the three previous full months (null if no data). */
  previousNormalAvgOre: number | null;
  topCategories: CategoryTotal[];
  recent: Transaction[];
  accounts: Account[];
  totalBalanceOre: number;
  recurringMonthlyOre: number;
  recurringCount: number;
  reviewCount: number;
  lastImportAt: string | null;
  hasData: boolean;
}

export interface StatisticsResponse {
  summary: PeriodSummary;
  series: MonthPoint[];
  topMerchants: MerchantTotal[];
  fixedVariable: FixedVariable;
  balance: BalancePoint[];
}

export interface ReviewResponse {
  unknown: Transaction[];
  lowConfidence: Transaction[];
  oneOffs: Transaction[];
  doubles: Transaction[];
  newPersons: Person[];
  importWarnings: ImportRecord[];
  total: number;
}

export interface PersonStatsResponse {
  months: Array<{ month: string; inOre: number; outOre: number }>;
  inOre: number;
  outOre: number;
  transactions: Transaction[];
}

export interface WizardPersonLine {
  personId: number;
  personName: string;
  direction: 'in' | 'out';
  accountId: number;
  accountName: string;
  count: number;
  sumOre: number;
  currentCategoryId: string | null;
}

export interface WizardResponse {
  accounts: Account[];
  personLines: WizardPersonLine[];
  oneOffs: Transaction[];
  unknownMerchants: Array<{ merchantKey: string; name: string; count: number; sumOre: number; sampleTxId: number }>;
}

export interface EngineMessage {
  id: number;
  req: EngineRequest;
}

export interface EngineReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type RecurringResponse = RecurringGroup[];
