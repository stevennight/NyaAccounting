import {
  addDays,
  addMonths,
  addYears,
  compareLocalDates,
  getMonthBounds,
  isLocalDate,
  isMonthKey,
  toMonthKey,
} from './date';
import type {
  CategoryId,
  CurrencyCode,
  LocalDate,
  MonthKey,
  RecurringExpense,
  Transaction,
} from './types';

export interface RecurringExpenseMatchInput {
  amountMinor: number | null;
  currency: CurrencyCode | null;
  merchant: string;
  description?: string;
  categoryId?: CategoryId | null;
}

export interface RecurringReserveItem {
  recurringExpense: RecurringExpense;
  dueDates: LocalDate[];
  postedCount: number;
  remainingOccurrences: number;
  reservedMinor: number;
}

export interface RecurringReserveOptions {
  currency: CurrencyCode;
  asOfDate?: LocalDate;
}

function normalizeMatchText(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function findRecurringExpenseMatch(
  input: RecurringExpenseMatchInput,
  recurringExpenses: readonly RecurringExpense[],
): RecurringExpense | null {
  if (
    input.amountMinor === null ||
    input.amountMinor <= 0 ||
    !input.currency
  ) {
    return null;
  }

  const merchant = normalizeMatchText(input.merchant);
  const description = normalizeMatchText(input.description);
  const capturedText = `${merchant}${description}`;
  if (capturedText.length < 2) {
    return null;
  }

  const matches = recurringExpenses.filter((expense) => {
    if (
      !expense.active ||
      expense.amountMinor !== input.amountMinor ||
      expense.currency !== input.currency
    ) {
      return false;
    }

    return [expense.merchant, expense.name].some((value) => {
      const identity = normalizeMatchText(value);
      if (identity.length < 2) {
        return false;
      }
      return (
        capturedText.includes(identity) ||
        (merchant.length >= 2 && identity.includes(merchant))
      );
    });
  });

  return matches.length === 1 ? matches[0] : null;
}

function occurrenceAt(
  expense: RecurringExpense,
  occurrenceIndex: number,
): LocalDate {
  const interval = Math.max(1, Math.floor(expense.interval));
  switch (expense.cadence) {
    case 'weekly':
      return addDays(expense.startDate, occurrenceIndex * interval * 7);
    case 'monthly':
      return addMonths(expense.startDate, occurrenceIndex * interval);
    case 'quarterly':
      return addMonths(expense.startDate, occurrenceIndex * interval * 3);
    case 'yearly':
      return addYears(expense.startDate, occurrenceIndex * interval);
  }
}

export function getRecurringOccurrenceDates(
  expense: RecurringExpense,
  month: MonthKey,
): LocalDate[] {
  if (
    !expense.active ||
    !isMonthKey(month) ||
    !isLocalDate(expense.startDate) ||
    (expense.endDate && !isLocalDate(expense.endDate))
  ) {
    return [];
  }

  const bounds = getMonthBounds(month);
  if (
    compareLocalDates(expense.startDate, bounds.end) > 0 ||
    (expense.endDate &&
      compareLocalDates(expense.endDate, bounds.start) < 0)
  ) {
    return [];
  }

  const dates: LocalDate[] = [];
  const maximumIterations = 10_000;

  for (let index = 0; index < maximumIterations; index += 1) {
    const occurrence = occurrenceAt(expense, index);

    if (
      expense.endDate &&
      compareLocalDates(occurrence, expense.endDate) > 0
    ) {
      break;
    }
    if (compareLocalDates(occurrence, bounds.end) > 0) {
      break;
    }
    if (compareLocalDates(occurrence, bounds.start) >= 0) {
      dates.push(occurrence);
    }
  }

  return dates;
}

export function calculateRecurringReserve(
  recurringExpenses: readonly RecurringExpense[],
  transactions: readonly Transaction[],
  month: MonthKey,
  options: RecurringReserveOptions,
): RecurringReserveItem[] {
  const asOfDate = options.asOfDate;
  if (
    asOfDate &&
    isLocalDate(asOfDate) &&
    month < toMonthKey(asOfDate)
  ) {
    return [];
  }

  return recurringExpenses.flatMap((expense) => {
    if (
      expense.currency !== options.currency ||
      !Number.isSafeInteger(expense.amountMinor) ||
      expense.amountMinor <= 0
    ) {
      return [];
    }

    const dueDates = getRecurringOccurrenceDates(expense, month);
    if (dueDates.length === 0) {
      return [];
    }

    const postedCount = transactions.filter(
      (transaction) =>
        transaction.recurringExpenseId === expense.id &&
        transaction.currency === options.currency &&
        transaction.kind === 'expense' &&
        transaction.status === 'confirmed' &&
        transaction.date.startsWith(`${month}-`),
    ).length;
    const remainingOccurrences = Math.max(
      0,
      dueDates.length - postedCount,
    );

    if (remainingOccurrences === 0) {
      return [];
    }

    return [
      {
        recurringExpense: expense,
        dueDates,
        postedCount,
        remainingOccurrences,
        reservedMinor: remainingOccurrences * expense.amountMinor,
      },
    ];
  });
}

export function calculateRecurringReserveMinor(
  recurringExpenses: readonly RecurringExpense[],
  transactions: readonly Transaction[],
  month: MonthKey,
  options: RecurringReserveOptions,
): number {
  return calculateRecurringReserve(
    recurringExpenses,
    transactions,
    month,
    options,
  ).reduce((total, item) => total + item.reservedMinor, 0);
}

export function getMonthlyEquivalentMinor(
  expense: RecurringExpense,
): number {
  const interval = Math.max(1, Math.floor(expense.interval));
  switch (expense.cadence) {
    case 'weekly':
      return Math.round((expense.amountMinor * 52) / (12 * interval));
    case 'monthly':
      return Math.round(expense.amountMinor / interval);
    case 'quarterly':
      return Math.round(expense.amountMinor / (3 * interval));
    case 'yearly':
      return Math.round(expense.amountMinor / (12 * interval));
  }
}
