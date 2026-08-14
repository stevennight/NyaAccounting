export const TRANSACTION_KINDS = [
  'expense',
  'refund',
  'transfer',
  'repayment',
  'investment',
  'top_up',
  'income',
] as const;

export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_STATUSES = [
  'confirmed',
  'pending',
  'failed',
  'cancelled',
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const CATEGORY_IDS = [
  'food',
  'digital',
  'transport',
  'daily',
  'housing',
  'health',
  'learning',
  'leisure',
  'social',
  'travel',
  'other',
] as const;

/** Stable category identifier. Built-in and user-defined IDs share this type. */
export type CategoryId = string;

export interface SubcategoryDefinition {
  id: string;
  label: string;
}

export interface CategoryDefinition {
  id: CategoryId;
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  subcategories: SubcategoryDefinition[];
}

export const PAYMENT_CHANNELS = [
  'alipay',
  'wechat_pay',
  'unionpay',
  'apple_pay',
  'bank_app',
  'merchant_direct',
  'cash',
  'other',
  'unknown',
] as const;

/** Built-in IDs remain stable; user-defined channels use their own IDs. */
export type PaymentChannel = string;

export interface PaymentChannelDefinition {
  id: PaymentChannel;
  label: string;
}

export const FUNDING_INSTRUMENT_TYPES = [
  'credit_card',
  'debit_card',
  'platform_balance',
  'credit_line',
  'cash',
  'other',
  'unknown',
] as const;

export type FundingInstrumentType =
  (typeof FUNDING_INSTRUMENT_TYPES)[number];

export interface FundingInstrument {
  type: FundingInstrumentType;
  issuer?: string;
  label?: string;
  last4?: string;
}

export const TRANSACTION_SOURCES = [
  'image',
  'text',
  'voice',
  'combined',
  'manual',
  'import',
  'demo',
] as const;

export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export type CurrencyCode = string;
export type LocalDate = string;
export type LocalTime = string;
export type MonthKey = string;

export interface Transaction {
  schemaVersion: 1;
  id: string;
  kind: TransactionKind;
  status: TransactionStatus;
  /**
   * Absolute integer amount in the currency's smallest unit. The transaction
   * kind determines whether the spending impact is positive or negative.
   */
  amountMinor: number;
  currency: CurrencyCode;
  /**
   * Calendar date used for grouping. It intentionally has no timezone.
   */
  date: LocalDate;
  /**
   * Optional wall-clock transaction time in HH:mm:ss format. It intentionally
   * has no timezone because payment screenshots show local account time.
   */
  time?: LocalTime;
  merchant: string;
  description?: string;
  categoryId: CategoryId;
  subcategoryId?: string;
  paymentChannel: PaymentChannel;
  fundingInstrument?: FundingInstrument;
  recurringExpenseId?: string;
  note?: string;
  tags: string[];
  source: TransactionSource;
  sourceFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
}

export const DRAFT_FIELD_NAMES = [
  'kind',
  'status',
  'amountMinor',
  'currency',
  'date',
  'time',
  'merchant',
  'description',
  'categoryId',
  'subcategoryId',
  'paymentChannel',
  'fundingInstrument',
] as const;

export type DraftFieldName = (typeof DRAFT_FIELD_NAMES)[number];

export type DraftEvidenceSource =
  | 'image'
  | 'text'
  | 'voice'
  | 'inferred'
  | 'user';

export interface DraftFieldEvidence {
  source: DraftEvidenceSource;
  confidence: number;
  evidence?: string;
}

export type DomainIssueSeverity = 'error' | 'warning';

export interface DomainIssue {
  code:
    | 'missing_amount'
    | 'invalid_amount'
    | 'missing_date'
    | 'invalid_date'
    | 'invalid_time'
    | 'missing_kind'
    | 'invalid_kind'
    | 'missing_status'
    | 'invalid_status'
    | 'missing_currency'
    | 'invalid_currency'
    | 'missing_merchant'
    | 'invalid_category'
    | 'invalid_channel'
    | 'invalid_funding_instrument'
    | 'low_confidence'
    | 'unsupported_value';
  severity: DomainIssueSeverity;
  field?: DraftFieldName;
  message: string;
}

export interface TransactionDraftReview {
  required: boolean;
  fields: DraftFieldName[];
  reasons: string[];
}

export interface TransactionDraft {
  schemaVersion: 1;
  id: string;
  kind: TransactionKind | null;
  status: TransactionStatus | null;
  amountMinor: number | null;
  currency: CurrencyCode | null;
  date: LocalDate | null;
  time: LocalTime | null;
  merchant: string;
  description?: string;
  categoryId: CategoryId | null;
  subcategoryId?: string;
  paymentChannel: PaymentChannel;
  fundingInstrument?: FundingInstrument;
  recurringExpenseId?: string;
  note?: string;
  tags: string[];
  source: TransactionSource;
  sourceFingerprint?: string;
  evidence: Partial<Record<DraftFieldName, DraftFieldEvidence>>;
  confidence: number;
  review: TransactionDraftReview;
  issues: DomainIssue[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Input accepted from an AI response, an import, or a partially edited form.
 * Known fields are documented while callers may still pass provider-specific
 * extra keys through structural typing.
 */
export interface TransactionDraftInput {
  id?: unknown;
  kind?: unknown;
  type?: unknown;
  transactionType?: unknown;
  status?: unknown;
  amount?: unknown;
  amountMinor?: unknown;
  currency?: unknown;
  date?: unknown;
  time?: unknown;
  occurredAt?: unknown;
  merchant?: unknown;
  description?: unknown;
  categoryId?: unknown;
  category?: unknown;
  subcategoryId?: unknown;
  subcategory?: unknown;
  paymentChannel?: unknown;
  channel?: unknown;
  fundingInstrument?: unknown;
  paymentMethod?: unknown;
  recurringExpenseId?: unknown;
  note?: unknown;
  tags?: unknown;
  source?: unknown;
  sourceFingerprint?: unknown;
  evidence?: unknown;
  confidence?: unknown;
  overallConfidence?: unknown;
  review?: unknown;
  needsReview?: unknown;
  reviewFields?: unknown;
  reviewReasons?: unknown;
}

export const RECURRENCE_CADENCES = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;

export type RecurrenceCadence = (typeof RECURRENCE_CADENCES)[number];

export interface RecurringExpense {
  schemaVersion: 1;
  id: string;
  name: string;
  merchant?: string;
  amountMinor: number;
  currency: CurrencyCode;
  categoryId: CategoryId;
  subcategoryId?: string;
  cadence: RecurrenceCadence;
  interval: number;
  startDate: LocalDate;
  endDate?: LocalDate;
  active: boolean;
  paymentChannel: PaymentChannel;
  fundingInstrument?: FundingInstrument;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiSettings {
  enabled: boolean;
  endpoint: string;
  model: string;
  transcriptionModel?: string;
  reasoningEffort: AiReasoningEffort;
  requestTimeoutMs: number;
  maxConcurrentRecognitions: number;
  sendImages: boolean;
}

export const AI_REASONING_EFFORTS = [
  'auto',
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type AiReasoningEffort = (typeof AI_REASONING_EFFORTS)[number];

export interface AppSettings {
  schemaVersion: 1;
  currency: CurrencyCode;
  locale: string;
  monthlyBudgetMinor: number;
  categories: CategoryDefinition[];
  categoryBudgetsMinor: Partial<Record<CategoryId, number>>;
  reserveRecurringExpenses: boolean;
  budgetWarningRatio: number;
  budgetDangerRatio: number;
  defaultCategoryId: CategoryId;
  defaultPaymentChannel: PaymentChannel;
  paymentChannels: PaymentChannelDefinition[];
  defaultFundingInstrument?: FundingInstrument;
  firstDayOfWeek: 0 | 1;
  theme: 'system' | 'light' | 'dark';
  deleteRawSourcesAfterConfirmation: boolean;
  ai: AiSettings;
}

export interface DomainDataset {
  settings: AppSettings;
  transactions: Transaction[];
  recurringExpenses: RecurringExpense[];
}
