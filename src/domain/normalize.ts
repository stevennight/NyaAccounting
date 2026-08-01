import {
  DRAFT_FIELD_NAMES,
  FUNDING_INSTRUMENT_TYPES,
  PAYMENT_CHANNELS,
  TRANSACTION_KINDS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  type CategoryId,
  type DomainIssue,
  type DraftFieldEvidence,
  type DraftFieldName,
  type FundingInstrument,
  type FundingInstrumentType,
  type PaymentChannel,
  type Transaction,
  type TransactionDraft,
  type TransactionDraftInput,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
  type TransactionDraftReview,
} from './types';
import { isCategoryId, isValidSubcategory } from './categories';
import {
  isLocalTime,
  normalizeLocalDate,
  normalizeLocalTime,
} from './date';
import {
  normalizeCurrencyCode,
  normalizeMinorAmount,
  parseMoneyToMinor,
} from './money';

const KIND_ALIASES: Readonly<Record<string, TransactionKind>> = {
  expense: 'expense',
  spending: 'expense',
  purchase: 'expense',
  payment: 'expense',
  支出: 'expense',
  消费: 'expense',
  付款: 'expense',
  refund: 'refund',
  reimbursement: 'refund',
  退款: 'refund',
  退货: 'refund',
  transfer: 'transfer',
  转账: 'transfer',
  repayment: 'repayment',
  card_repayment: 'repayment',
  还款: 'repayment',
  信用卡还款: 'repayment',
  investment: 'investment',
  投资: 'investment',
  基金: 'investment',
  理财: 'investment',
  top_up: 'top_up',
  topup: 'top_up',
  recharge: 'top_up',
  充值: 'top_up',
  income: 'income',
  收入: 'income',
};

const STATUS_ALIASES: Readonly<Record<string, TransactionStatus>> = {
  confirmed: 'confirmed',
  completed: 'confirmed',
  complete: 'confirmed',
  success: 'confirmed',
  successful: 'confirmed',
  paid: 'confirmed',
  已确认: 'confirmed',
  已完成: 'confirmed',
  交易成功: 'confirmed',
  支付成功: 'confirmed',
  pending: 'pending',
  processing: 'pending',
  待处理: 'pending',
  处理中: 'pending',
  failed: 'failed',
  failure: 'failed',
  失败: 'failed',
  支付失败: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  voided: 'cancelled',
  已取消: 'cancelled',
  已关闭: 'cancelled',
};

const CATEGORY_ALIASES: Readonly<Record<string, CategoryId>> = {
  food: 'food',
  dining: 'food',
  groceries: 'food',
  吃喝: 'food',
  餐饮: 'food',
  美食: 'food',
  外卖: 'food',
  digital: 'digital',
  subscription: 'digital',
  subscriptions: 'digital',
  software: 'digital',
  数字与订阅: 'digital',
  订阅: 'digital',
  软件: 'digital',
  数码: 'digital',
  电脑: 'digital',
  transport: 'transport',
  transportation: 'transport',
  交通: 'transport',
  出行: 'transport',
  daily: 'daily',
  shopping: 'daily',
  household: 'daily',
  日用购物: 'daily',
  购物: 'daily',
  日用: 'daily',
  housing: 'housing',
  home: 'housing',
  居住: 'housing',
  房租: 'housing',
  health: 'health',
  medical: 'health',
  医疗健康: 'health',
  医疗: 'health',
  健康: 'health',
  learning: 'learning',
  education: 'learning',
  学习成长: 'learning',
  学习: 'learning',
  教育: 'learning',
  leisure: 'leisure',
  entertainment: 'leisure',
  休闲娱乐: 'leisure',
  娱乐: 'leisure',
  social: 'social',
  gifts: 'social',
  人情社交: 'social',
  社交: 'social',
  人情: 'social',
  travel: 'travel',
  旅行: 'travel',
  旅游: 'travel',
  other: 'other',
  其他: 'other',
};

const CHANNEL_ALIASES: Readonly<Record<string, PaymentChannel>> = {
  alipay: 'alipay',
  支付宝: 'alipay',
  wechat: 'wechat_pay',
  wechat_pay: 'wechat_pay',
  微信: 'wechat_pay',
  微信支付: 'wechat_pay',
  unionpay: 'unionpay',
  quickpass: 'unionpay',
  云闪付: 'unionpay',
  银联: 'unionpay',
  apple_pay: 'apple_pay',
  applepay: 'apple_pay',
  bank_app: 'bank_app',
  bank: 'bank_app',
  银行: 'bank_app',
  银行app: 'bank_app',
  merchant_direct: 'merchant_direct',
  direct: 'merchant_direct',
  商户直付: 'merchant_direct',
  cash: 'cash',
  现金: 'cash',
  other: 'other',
  其他: 'other',
  unknown: 'unknown',
  未知: 'unknown',
  未识别: 'unknown',
};

const FUNDING_ALIASES: Readonly<
  Record<string, FundingInstrumentType>
> = {
  credit_card: 'credit_card',
  creditcard: 'credit_card',
  credit: 'credit_card',
  信用卡: 'credit_card',
  debit_card: 'debit_card',
  debitcard: 'debit_card',
  debit: 'debit_card',
  储蓄卡: 'debit_card',
  借记卡: 'debit_card',
  platform_balance: 'platform_balance',
  balance: 'platform_balance',
  余额: 'platform_balance',
  零钱: 'platform_balance',
  credit_line: 'credit_line',
  creditline: 'credit_line',
  花呗: 'credit_line',
  白条: 'credit_line',
  cash: 'cash',
  现金: 'cash',
  other: 'other',
  其他: 'other',
  unknown: 'unknown',
  未知: 'unknown',
  未识别: 'unknown',
};

export interface NormalizeDraftOptions {
  defaultCurrency?: string;
  defaultDate?: string;
  defaultCategoryId?: CategoryId;
  defaultStatus?: TransactionStatus;
  defaultPaymentChannel?: PaymentChannel;
  source?: TransactionSource;
  now?: Date;
  idFactory?: (prefix: string) => string;
}

export interface ConfirmDraftOptions {
  now?: Date;
  transactionId?: string;
}

export type ConfirmDraftResult =
  | { ok: true; transaction: Transaction }
  | { ok: false; issues: DomainIssue[] };

function normalizedAliasKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function safeTimestamp(date: Date | undefined): string {
  const value = date ?? new Date();
  return Number.isFinite(value.getTime())
    ? value.toISOString()
    : new Date().toISOString();
}

export function createDomainId(prefix: string, now = new Date()): string {
  const time = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${time.toString(36)}_${random}`;
}

export function normalizeTransactionKind(
  value: unknown,
): TransactionKind | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizedAliasKey(value);
  return (
    KIND_ALIASES[normalized] ??
    ((TRANSACTION_KINDS as readonly string[]).includes(normalized)
      ? (normalized as TransactionKind)
      : null)
  );
}

export function normalizeTransactionStatus(
  value: unknown,
): TransactionStatus | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizedAliasKey(value);
  return (
    STATUS_ALIASES[normalized] ??
    ((TRANSACTION_STATUSES as readonly string[]).includes(normalized)
      ? (normalized as TransactionStatus)
      : null)
  );
}

export function normalizeCategoryId(value: unknown): CategoryId | null {
  if (isCategoryId(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }

  return CATEGORY_ALIASES[normalizedAliasKey(value)] ?? null;
}

export function normalizePaymentChannel(
  value: unknown,
): PaymentChannel | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizedAliasKey(value);
  return (
    CHANNEL_ALIASES[normalized] ??
    ((PAYMENT_CHANNELS as readonly string[]).includes(normalized)
      ? (normalized as PaymentChannel)
      : null)
  );
}

export function normalizeFundingInstrument(
  value: unknown,
): FundingInstrument | undefined {
  if (typeof value === 'string') {
    const normalized = normalizedAliasKey(value);
    const type =
      FUNDING_ALIASES[normalized] ??
      ((FUNDING_INSTRUMENT_TYPES as readonly string[]).includes(normalized)
        ? (normalized as FundingInstrumentType)
        : undefined);

    if (!type) {
      return undefined;
    }

    const last4Match = value.match(/(?:尾号|末四位|last\s*4)?\s*(\d{4})\b/i);
    return {
      type,
      label: value.trim(),
      ...(last4Match ? { last4: last4Match[1] } : {}),
    };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const rawType = stringValue(record.type);
  const normalizedType = rawType
    ? FUNDING_ALIASES[normalizedAliasKey(rawType)] ??
      ((FUNDING_INSTRUMENT_TYPES as readonly string[]).includes(
        normalizedAliasKey(rawType),
      )
        ? (normalizedAliasKey(rawType) as FundingInstrumentType)
        : undefined)
    : undefined;

  if (!normalizedType) {
    return undefined;
  }

  const last4 = stringValue(record.last4)?.replace(/\D/g, '').slice(-4);
  return {
    type: normalizedType,
    ...(stringValue(record.issuer)
      ? { issuer: stringValue(record.issuer) }
      : {}),
    ...(stringValue(record.label) ? { label: stringValue(record.label) } : {}),
    ...(last4?.length === 4 ? { last4 } : {}),
  };
}

function normalizeSource(
  value: unknown,
  fallback: TransactionSource,
): TransactionSource {
  if (
    typeof value === 'string' &&
    (TRANSACTION_SOURCES as readonly string[]).includes(value)
  ) {
    return value as TransactionSource;
  }

  return fallback;
}

function normalizeTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，]/)
      : [];

  return Array.from(
    new Set(
      values
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeEvidence(
  value: unknown,
): Partial<Record<DraftFieldName, DraftFieldEvidence>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const evidence: Partial<Record<DraftFieldName, DraftFieldEvidence>> = {};

  for (const field of DRAFT_FIELD_NAMES) {
    const raw = record[field];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }

    const item = raw as Record<string, unknown>;
    const rawSource = stringValue(item.source);
    const source =
      rawSource &&
      ['image', 'text', 'voice', 'inferred', 'user'].includes(rawSource)
        ? (rawSource as DraftFieldEvidence['source'])
        : 'inferred';
    const confidence =
      typeof item.confidence === 'number' &&
      Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.5;

    evidence[field] = {
      source,
      confidence,
      ...(stringValue(item.evidence)
        ? { evidence: stringValue(item.evidence) }
        : {}),
    };
  }

  return evidence;
}

function normalizeConfidence(
  input: TransactionDraftInput,
  evidence: Partial<Record<DraftFieldName, DraftFieldEvidence>>,
  source: TransactionSource,
): number {
  const rawConfidence = input.confidence ?? input.overallConfidence;
  if (typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)) {
    return Math.max(0, Math.min(1, rawConfidence));
  }

  const values = Object.values(evidence).map((item) => item.confidence);
  if (values.length > 0) {
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  return source === 'manual' ? 1 : 0.5;
}

function normalizeReview(
  input: TransactionDraftInput,
): TransactionDraftReview {
  const rawReview =
    input.review &&
    typeof input.review === 'object' &&
    !Array.isArray(input.review)
      ? (input.review as Record<string, unknown>)
      : undefined;
  const rawFields = rawReview?.fields ?? input.reviewFields;
  const fields = Array.isArray(rawFields)
    ? Array.from(
        new Set(
          rawFields.filter(
            (field): field is DraftFieldName =>
              typeof field === 'string' &&
              (DRAFT_FIELD_NAMES as readonly string[]).includes(field),
          ),
        ),
      )
    : [];
  const rawReasons = rawReview?.reasons ?? input.reviewReasons;
  const reasons = Array.isArray(rawReasons)
    ? Array.from(
        new Set(
          rawReasons
            .filter((reason): reason is string => typeof reason === 'string')
            .map((reason) => reason.trim())
            .filter(Boolean),
        ),
      )
    : [];
  const explicitRequired =
    typeof rawReview?.required === 'boolean'
      ? rawReview.required
      : input.needsReview === true;

  return {
    required: explicitRequired || fields.length > 0,
    fields,
    reasons,
  };
}

function issue(
  code: DomainIssue['code'],
  severity: DomainIssue['severity'],
  message: string,
  field?: DraftFieldName,
): DomainIssue {
  return { code, severity, message, ...(field ? { field } : {}) };
}

export function validateTransactionDraft(
  draft: TransactionDraft,
): DomainIssue[] {
  const issues: DomainIssue[] = [];

  if (!draft.kind) {
    issues.push(issue('missing_kind', 'error', '请选择交易类型', 'kind'));
  }
  if (!draft.status) {
    issues.push(
      issue('missing_status', 'error', '请选择交易状态', 'status'),
    );
  }
  if (
    draft.amountMinor === null ||
    !Number.isSafeInteger(draft.amountMinor) ||
    draft.amountMinor <= 0
  ) {
    issues.push(
      issue('missing_amount', 'error', '请输入大于 0 的金额', 'amountMinor'),
    );
  }
  if (!draft.currency) {
    issues.push(
      issue('missing_currency', 'error', '请选择币种', 'currency'),
    );
  }
  if (!draft.date) {
    issues.push(issue('missing_date', 'error', '请选择交易日期', 'date'));
  }
  if (draft.time !== null && !isLocalTime(draft.time)) {
    issues.push(
      issue('invalid_time', 'error', '交易时间格式应为 HH:mm:ss', 'time'),
    );
  }
  if (!draft.merchant.trim()) {
    issues.push(
      issue('missing_merchant', 'error', '请填写消费内容或商户', 'merchant'),
    );
  }
  if (!draft.categoryId) {
    issues.push(
      issue('invalid_category', 'error', '请选择消费分类', 'categoryId'),
    );
  } else if (
    draft.subcategoryId &&
    !isValidSubcategory(draft.categoryId, draft.subcategoryId)
  ) {
    issues.push(
      issue(
        'invalid_category',
        'warning',
        '子分类与当前分类不匹配，保存时将移除',
        'subcategoryId',
      ),
    );
  }

  for (const field of DRAFT_FIELD_NAMES) {
    const fieldEvidence = draft.evidence[field];
    if (fieldEvidence && fieldEvidence.confidence < 0.55) {
      issues.push(
        issue(
          'low_confidence',
          'warning',
          `${field} 的识别置信度较低，请确认`,
          field,
        ),
      );
    }
  }

  return issues;
}

export function normalizeTransactionDraft(
  input: TransactionDraftInput,
  options: NormalizeDraftOptions = {},
): TransactionDraft {
  const now = options.now ?? new Date();
  const timestamp = safeTimestamp(now);
  const defaultCurrency =
    normalizeCurrencyCode(options.defaultCurrency ?? 'CNY') ?? 'CNY';
  const currency = normalizeCurrencyCode(input.currency, defaultCurrency);
  const rawKind = input.kind ?? input.transactionType ?? input.type;
  let kind = normalizeTransactionKind(rawKind);

  const rawAmountMinor = normalizeMinorAmount(input.amountMinor);
  const parsedAmount =
    rawAmountMinor ??
    (currency ? parseMoneyToMinor(input.amount, currency) : null);
  if (
    kind === null &&
    typeof parsedAmount === 'number' &&
    parsedAmount < 0
  ) {
    kind = 'refund';
  }
  const amountMinor =
    parsedAmount === null ? null : Math.abs(parsedAmount);

  const rawCategory = input.categoryId ?? input.category;
  const categoryId =
    normalizeCategoryId(rawCategory) ?? options.defaultCategoryId ?? 'other';
  const rawSubcategory = stringValue(
    input.subcategoryId ?? input.subcategory,
  );
  const subcategoryId =
    rawSubcategory && isValidSubcategory(categoryId, rawSubcategory)
      ? rawSubcategory
      : undefined;

  const merchant =
    stringValue(input.merchant) ?? stringValue(input.description) ?? '';
  const description = stringValue(input.description);
  const paymentChannel =
    normalizePaymentChannel(input.paymentChannel ?? input.channel) ??
    options.defaultPaymentChannel ??
    'unknown';
  const fundingValue =
    input.fundingInstrument ?? input.paymentMethod;
  const fundingInstrument = normalizeFundingInstrument(fundingValue);
  const date =
    normalizeLocalDate(input.date ?? input.occurredAt) ??
    normalizeLocalDate(options.defaultDate);
  const normalizedTags = normalizeTags(input.tags);
  const legacyTimeTag = normalizedTags.find((tag) =>
    /^time:\d{2}:\d{2}(?::\d{2})?$/.test(tag),
  );
  const rawTime =
    input.time !== undefined
      ? input.time
      : input.occurredAt !== undefined
        ? input.occurredAt
        : input.date;
  const time =
    normalizeLocalTime(rawTime) ??
    normalizeLocalTime(legacyTimeTag?.slice(5));
  const tags = normalizedTags.filter(
    (tag) => !/^time:\d{2}:\d{2}(?::\d{2})?$/.test(tag),
  );
  const status =
    normalizeTransactionStatus(input.status) ??
    options.defaultStatus ??
    null;
  const source = normalizeSource(input.source, options.source ?? 'combined');
  const evidence = normalizeEvidence(input.evidence);
  const confidence = normalizeConfidence(input, evidence, source);
  const review = normalizeReview(input);
  const id =
    stringValue(input.id) ??
    (options.idFactory ?? createDomainId)('draft');

  const draft: TransactionDraft = {
    schemaVersion: 1,
    id,
    kind,
    status,
    amountMinor,
    currency,
    date,
    time,
    merchant,
    ...(description && description !== merchant ? { description } : {}),
    categoryId,
    ...(subcategoryId ? { subcategoryId } : {}),
    paymentChannel,
    ...(fundingInstrument ? { fundingInstrument } : {}),
    ...(stringValue(input.recurringExpenseId)
      ? { recurringExpenseId: stringValue(input.recurringExpenseId) }
      : {}),
    ...(stringValue(input.note) ? { note: stringValue(input.note) } : {}),
    tags,
    source,
    ...(stringValue(input.sourceFingerprint)
      ? { sourceFingerprint: stringValue(input.sourceFingerprint) }
      : {}),
    evidence,
    confidence,
    review,
    issues: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  draft.issues = validateTransactionDraft(draft);

  if (rawKind !== undefined && kind === null) {
    draft.issues.unshift(
      issue('invalid_kind', 'error', '无法识别交易类型', 'kind'),
    );
  }
  if (input.status !== undefined && !normalizeTransactionStatus(input.status)) {
    draft.issues.unshift(
      issue('invalid_status', 'error', '无法识别交易状态', 'status'),
    );
  }
  if (
    (input.amount !== undefined || input.amountMinor !== undefined) &&
    amountMinor === null
  ) {
    draft.issues.unshift(
      issue('invalid_amount', 'error', '无法识别交易金额', 'amountMinor'),
    );
  }
  if (
    (input.date !== undefined || input.occurredAt !== undefined) &&
    !date
  ) {
    draft.issues.unshift(
      issue('invalid_date', 'error', '无法识别交易日期', 'date'),
    );
  }
  if (
    input.time !== undefined &&
    input.time !== null &&
    input.time !== '' &&
    !normalizeLocalTime(input.time)
  ) {
    draft.issues.unshift(
      issue('invalid_time', 'error', '无法识别交易时间', 'time'),
    );
  }
  if (rawCategory !== undefined && !normalizeCategoryId(rawCategory)) {
    draft.issues.push(
      issue(
        'invalid_category',
        'warning',
        '无法识别消费分类，已归入其他',
        'categoryId',
      ),
    );
  }
  if (
    (input.paymentChannel !== undefined || input.channel !== undefined) &&
    !normalizePaymentChannel(input.paymentChannel ?? input.channel)
  ) {
    draft.issues.push(
      issue(
        'invalid_channel',
        'warning',
        '无法识别支付渠道，已保留为未知',
        'paymentChannel',
      ),
    );
  }
  if (fundingValue !== undefined && !fundingInstrument) {
    draft.issues.push(
      issue(
        'invalid_funding_instrument',
        'warning',
        '无法识别实际扣款工具，已留空',
        'fundingInstrument',
      ),
    );
  }

  if (rawCategory === undefined) {
    draft.issues.push(
      issue(
        'invalid_category',
        'warning',
        '未识别消费分类，已归入其他',
        'categoryId',
      ),
    );
  }

  const reviewFields = Array.from(
    new Set([
      ...draft.review.fields,
      ...draft.issues.flatMap((item) => (item.field ? [item.field] : [])),
    ]),
  );
  const reviewReasons = Array.from(
    new Set([
      ...draft.review.reasons,
      ...draft.issues.map((item) => item.message),
    ]),
  );
  draft.review = {
    required: draft.review.required || draft.issues.length > 0,
    fields: reviewFields,
    reasons: reviewReasons,
  };

  return draft;
}

export function isTransactionDraftReady(
  draft: TransactionDraft,
): boolean {
  return !validateTransactionDraft(draft).some(
    (item) => item.severity === 'error',
  );
}

export function confirmTransactionDraft(
  draft: TransactionDraft,
  options: ConfirmDraftOptions = {},
): ConfirmDraftResult {
  const issues = validateTransactionDraft(draft);
  const blockingIssues = issues.filter((item) => item.severity === 'error');

  if (
    blockingIssues.length > 0 ||
    draft.kind === null ||
    draft.status === null ||
    draft.amountMinor === null ||
    draft.currency === null ||
    draft.date === null ||
    draft.categoryId === null
  ) {
    return { ok: false, issues };
  }

  const timestamp = safeTimestamp(options.now);
  const transaction: Transaction = {
    schemaVersion: 1,
    id: options.transactionId ?? draft.id.replace(/^draft_/, 'txn_'),
    kind: draft.kind,
    status: draft.status,
    amountMinor: Math.abs(draft.amountMinor),
    currency: draft.currency,
    date: draft.date,
    ...(draft.time ? { time: draft.time } : {}),
    merchant: draft.merchant.trim(),
    ...(draft.description?.trim()
      ? { description: draft.description.trim() }
      : {}),
    categoryId: draft.categoryId,
    ...(draft.subcategoryId &&
    isValidSubcategory(draft.categoryId, draft.subcategoryId)
      ? { subcategoryId: draft.subcategoryId }
      : {}),
    paymentChannel: draft.paymentChannel,
    ...(draft.fundingInstrument
      ? { fundingInstrument: draft.fundingInstrument }
      : {}),
    ...(draft.recurringExpenseId
      ? { recurringExpenseId: draft.recurringExpenseId }
      : {}),
    ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
    tags: normalizeTags(draft.tags).filter(
      (tag) => !/^time:\d{2}:\d{2}(?::\d{2})?$/.test(tag),
    ),
    source: draft.source,
    ...(draft.sourceFingerprint
      ? { sourceFingerprint: draft.sourceFingerprint }
      : {}),
    createdAt: draft.createdAt || timestamp,
    updatedAt: timestamp,
    ...(draft.status === 'confirmed' ? { confirmedAt: timestamp } : {}),
  };

  return { ok: true, transaction };
}

export function normalizeTransaction(
  input: unknown,
  options: NormalizeDraftOptions = {},
): ConfirmDraftResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      issues: [
        issue(
          'unsupported_value',
          'error',
          '交易记录必须是一个对象',
        ),
      ],
    };
  }

  const record = input as unknown as TransactionDraftInput;
  const draft = normalizeTransactionDraft(record, options);
  const result = confirmTransactionDraft(draft, {
    now: options.now,
    transactionId: stringValue(record.id),
  });

  if (!result.ok) {
    return result;
  }

  const original = input as Record<string, unknown>;
  return {
    ok: true,
    transaction: {
      ...result.transaction,
      createdAt:
        stringValue(original.createdAt) ?? result.transaction.createdAt,
      updatedAt:
        stringValue(original.updatedAt) ?? result.transaction.updatedAt,
      ...(stringValue(original.confirmedAt)
        ? { confirmedAt: stringValue(original.confirmedAt) }
        : {}),
    },
  };
}
