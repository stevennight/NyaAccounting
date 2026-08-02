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
  | 'same_time'
  | 'near_time'
  | 'same_merchant'
  | 'similar_merchant'
  | 'same_description'
  | 'similar_description'
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

function normalizeComparableText(value: string | undefined): string {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeMerchant(value: string): string {
  return normalizeComparableText(value).replace(
    /(?:有限责任公司|股份有限公司|有限公司|官方旗舰店|旗舰店|支付)$/u,
    '',
  );
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

function normalizedTextSimilarity(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
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

  const bigramSimilarity =
    (2 * matches) / (leftBigrams.length + bigrams(b).length);
  const containmentSimilarity =
    a.includes(b) || b.includes(a)
      ? Math.min(a.length, b.length) / Math.max(a.length, b.length)
      : 0;

  return Math.max(bigramSimilarity, containmentSimilarity);
}

function merchantSimilarity(left: string, right: string): number {
  return normalizedTextSimilarity(
    normalizeMerchant(left),
    normalizeMerchant(right),
  );
}

function descriptionSimilarity(
  left: string | undefined,
  right: string | undefined,
): number {
  return normalizedTextSimilarity(
    normalizeComparableText(left),
    normalizeComparableText(right),
  );
}

function localTimeToSeconds(transaction: Transaction): number | null {
  const time = getTransactionLocalTime(transaction);
  if (!time) {
    return null;
  }

  const [hour, minute, second] = time.split(':').map(Number);
  return hour * 3_600 + minute * 60 + second;
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

    let score = 0.38;
    let hasCorroboratingEvidence = false;
    const reasons: DuplicateReason[] = ['same_amount'];

    if (distance === 0) {
      reasons.push('same_date');

      const existingTime = localTimeToSeconds(existing);
      const candidateTime = localTimeToSeconds(candidate);
      if (existingTime !== null && candidateTime !== null) {
        const timeDistance = Math.abs(existingTime - candidateTime);
        if (timeDistance === 0) {
          score += 0.35;
          hasCorroboratingEvidence = true;
          reasons.push('same_time');
        } else if (timeDistance <= 5 * 60) {
          score += 0.22;
          hasCorroboratingEvidence = true;
          reasons.push('near_time');
        } else if (timeDistance <= 2 * 60 * 60) {
          score += 0.12;
          hasCorroboratingEvidence = true;
          reasons.push('near_time');
        } else {
          score += 0.05;
        }
      } else {
        score += 0.16;
      }
    } else {
      score += Math.max(0.02, 0.14 - distance * 0.04);
      reasons.push('near_date');
    }

    const similarity = merchantSimilarity(
      existing.merchant,
      candidate.merchant,
    );
    if (similarity === 1) {
      score += 0.22;
      hasCorroboratingEvidence = true;
      reasons.push('same_merchant');
    } else if (similarity >= 0.5) {
      score += 0.22 * similarity;
      hasCorroboratingEvidence = true;
      reasons.push('similar_merchant');
    }

    const contentSimilarity = descriptionSimilarity(
      existing.description,
      candidate.description,
    );
    if (contentSimilarity === 1) {
      score += 0.24;
      hasCorroboratingEvidence = true;
      reasons.push('same_description');
    } else if (contentSimilarity >= 0.5) {
      score += 0.24 * contentSimilarity;
      hasCorroboratingEvidence = true;
      reasons.push('similar_description');
    }

    if (
      existing.paymentChannel !== 'unknown' &&
      existing.paymentChannel === candidate.paymentChannel
    ) {
      score += 0.06;
      hasCorroboratingEvidence = true;
      reasons.push('same_payment_channel');
    }

    if (fundingInstrumentMatches(existing, candidate)) {
      score += 0.06;
      hasCorroboratingEvidence = true;
      reasons.push('same_funding_instrument');
    }

    const normalizedScore = Math.min(1, Number(score.toFixed(3)));
    if (hasCorroboratingEvidence && normalizedScore >= minimumScore) {
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
