import {
  daysBetween,
  isLocalDate,
  normalizeLocalTime,
} from './date';
import type {
  CurrencyCode,
  LocalTime,
  Transaction,
  TransactionKind,
} from './types';

export const SPENDING_KINDS: readonly TransactionKind[] = [
  'expense',
  'refund',
] as const;

export const EXCLUDED_SPENDING_KINDS: readonly TransactionKind[] = [
  'transfer',
  'repayment',
  'investment',
  'top_up',
  'income',
] as const;

const LEGACY_TIME_TAG_PATTERN = /^time:(\d{2}:\d{2}(?::\d{2})?)$/;

export function getTransactionLocalTime(
  transaction: Pick<Transaction, 'time' | 'tags'>,
): LocalTime | undefined {
  const direct = normalizeLocalTime(transaction.time);
  if (direct) {
    return direct;
  }

  const tags = Array.isArray(transaction.tags) ? transaction.tags : [];
  const legacyTag = tags.find((tag) => LEGACY_TIME_TAG_PATTERN.test(tag));
  return normalizeLocalTime(legacyTag?.slice(5)) ?? undefined;
}

export function compareTransactionDateTime(
  left: Transaction,
  right: Transaction,
): number {
  const dateOrder = left.date.localeCompare(right.date);
  if (dateOrder !== 0) {
    return dateOrder;
  }

  const timeOrder = (getTransactionLocalTime(left) ?? '').localeCompare(
    getTransactionLocalTime(right) ?? '',
  );
  return timeOrder || left.createdAt.localeCompare(right.createdAt);
}

export function getSpendingImpactMinor(
  transaction: Transaction,
  currency?: CurrencyCode,
): number {
  if (
    transaction.status !== 'confirmed' ||
    (currency && transaction.currency !== currency) ||
    !Number.isSafeInteger(transaction.amountMinor)
  ) {
    return 0;
  }

  if (transaction.kind === 'expense') {
    return Math.abs(transaction.amountMinor);
  }
  if (transaction.kind === 'refund') {
    return -Math.abs(transaction.amountMinor);
  }

  return 0;
}

export function isSpendingTransaction(
  transaction: Transaction,
  currency?: CurrencyCode,
): boolean {
  return getSpendingImpactMinor(transaction, currency) !== 0;
}

export function filterSpendingTransactions(
  transactions: readonly Transaction[],
  currency?: CurrencyCode,
): Transaction[] {
  return transactions.filter((transaction) =>
    isSpendingTransaction(transaction, currency),
  );
}

export type DuplicateReason =
  | 'source_fingerprint'
  | 'same_amount'
  | 'same_date'
  | 'near_date'
  | 'same_merchant'
  | 'similar_merchant'
  | 'same_payment_channel'
  | 'same_funding_instrument';

export interface DuplicateCandidate {
  transaction: Transaction;
  score: number;
  reasons: DuplicateReason[];
}

export interface DuplicateDetectionOptions {
  maximumDayDistance?: number;
  minimumScore?: number;
  limit?: number;
}

function normalizeMerchant(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(
      /(?:有限责任公司|股份有限公司|有限公司|官方旗舰店|旗舰店|支付)$/u,
      '',
    )
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function bigrams(value: string): string[] {
  if (value.length <= 1) {
    return value ? [value] : [];
  }

  return Array.from(
    { length: value.length - 1 },
    (_, index) => value.slice(index, index + 2),
  );
}

function merchantSimilarity(left: string, right: string): number {
  const a = normalizeMerchant(left);
  const b = normalizeMerchant(right);

  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const leftBigrams = bigrams(a);
  const remaining = bigrams(b);
  let matches = 0;

  for (const item of leftBigrams) {
    const index = remaining.indexOf(item);
    if (index >= 0) {
      matches += 1;
      remaining.splice(index, 1);
    }
  }

  return (2 * matches) / (leftBigrams.length + bigrams(b).length);
}

function fundingInstrumentMatches(
  left: Transaction,
  right: Transaction,
): boolean {
  const a = left.fundingInstrument;
  const b = right.fundingInstrument;
  if (!a || !b || a.type === 'unknown' || b.type === 'unknown') {
    return false;
  }
  if (a.type !== b.type) {
    return false;
  }

  if (a.last4 && b.last4) {
    return a.last4 === b.last4;
  }

  return (
    Boolean(a.issuer && b.issuer) &&
    a.issuer?.toLocaleLowerCase() === b.issuer?.toLocaleLowerCase()
  );
}

export function findDuplicateCandidates(
  candidate: Transaction,
  transactions: readonly Transaction[],
  options: DuplicateDetectionOptions = {},
): DuplicateCandidate[] {
  const maximumDayDistance = Math.max(
    0,
    Math.floor(options.maximumDayDistance ?? 2),
  );
  const minimumScore = Math.max(0, Math.min(1, options.minimumScore ?? 0.72));
  const limit = Math.max(1, Math.floor(options.limit ?? 5));
  const matches: DuplicateCandidate[] = [];

  for (const existing of transactions) {
    if (existing.id === candidate.id) {
      continue;
    }

    if (
      candidate.sourceFingerprint &&
      existing.sourceFingerprint &&
      candidate.sourceFingerprint === existing.sourceFingerprint
    ) {
      matches.push({
        transaction: existing,
        score: 1,
        reasons: ['source_fingerprint'],
      });
      continue;
    }

    if (
      existing.currency !== candidate.currency ||
      existing.kind !== candidate.kind ||
      Math.abs(existing.amountMinor) !== Math.abs(candidate.amountMinor) ||
      !isLocalDate(existing.date) ||
      !isLocalDate(candidate.date)
    ) {
      continue;
    }

    const distance = Math.abs(daysBetween(existing.date, candidate.date));
    if (distance > maximumDayDistance) {
      continue;
    }

    let score = 0.42;
    const reasons: DuplicateReason[] = ['same_amount'];

    if (distance === 0) {
      score += 0.22;
      reasons.push('same_date');
    } else {
      score += distance === 1 ? 0.14 : 0.08;
      reasons.push('near_date');
    }

    const similarity = merchantSimilarity(
      existing.merchant,
      candidate.merchant,
    );
    if (similarity === 1) {
      score += 0.26;
      reasons.push('same_merchant');
    } else if (similarity >= 0.5) {
      score += 0.26 * similarity;
      reasons.push('similar_merchant');
    }

    if (
      existing.paymentChannel !== 'unknown' &&
      existing.paymentChannel === candidate.paymentChannel
    ) {
      score += 0.05;
      reasons.push('same_payment_channel');
    }

    if (fundingInstrumentMatches(existing, candidate)) {
      score += 0.05;
      reasons.push('same_funding_instrument');
    }

    const normalizedScore = Math.min(1, Number(score.toFixed(3)));
    if (normalizedScore >= minimumScore) {
      matches.push({
        transaction: existing,
        score: normalizedScore,
        reasons,
      });
    }
  }

  return matches
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.transaction.date.localeCompare(left.transaction.date),
    )
    .slice(0, limit);
}

export function hasLikelyDuplicate(
  candidate: Transaction,
  transactions: readonly Transaction[],
  options?: DuplicateDetectionOptions,
): boolean {
  return findDuplicateCandidates(candidate, transactions, {
    ...options,
    limit: 1,
  }).length > 0;
}
