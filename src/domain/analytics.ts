import {
  CATEGORY_DEFINITIONS,
  getCategoryDefinition,
} from './categories';
import {
  daysInMonth,
  formatLocalDate,
  formatMonthKey,
  isLocalDate,
  isMonthKey,
  toMonthKey,
  trailingMonthKeys,
} from './date';
import { calculateRecurringReserveMinor } from './recurring';
import { getSpendingImpactMinor } from './transactions';
import type {
  AppSettings,
  CategoryDefinition,
  CategoryId,
  CurrencyCode,
  LocalDate,
  MonthKey,
  RecurringExpense,
  Transaction,
} from './types';

export type BudgetHealth =
  | 'not_set'
  | 'healthy'
  | 'watch'
  | 'danger'
  | 'over';

export interface MonthlyBudgetInput {
  transactions: readonly Transaction[];
  month: MonthKey;
  budgetMinor: number;
  currency: CurrencyCode;
  recurringExpenses?: readonly RecurringExpense[];
  reserveRecurringExpenses?: boolean;
  asOfDate?: LocalDate;
  warningRatio?: number;
  dangerRatio?: number;
}

export interface MonthlyBudgetSummary {
  month: MonthKey;
  currency: CurrencyCode;
  budgetMinor: number;
  grossExpenseMinor: number;
  refundMinor: number;
  netSpentMinor: number;
  recurringReservedMinor: number;
  committedMinor: number;
  remainingMinor: number;
  usedRatio: number | null;
  progressRatio: number;
  health: BudgetHealth;
  countedTransactionCount: number;
  foreignCurrencyTransactionCount: number;
  elapsedDays: number;
  daysRemaining: number;
  dailyAvailableMinor: number;
  projectedMonthEndMinor: number;
}

export interface CategoryAnalyticsInput {
  transactions: readonly Transaction[];
  month: MonthKey;
  currency: CurrencyCode;
  categories?: readonly CategoryDefinition[];
  categoryBudgetsMinor?: Partial<Record<CategoryId, number>>;
}

export interface CategoryAnalyticsItem {
  categoryId: CategoryId;
  label: string;
  color: string;
  icon: string;
  grossExpenseMinor: number;
  refundMinor: number;
  netSpentMinor: number;
  chartAmountMinor: number;
  shareRatio: number;
  transactionCount: number;
  budgetMinor: number | null;
  budgetRemainingMinor: number | null;
  budgetUsedRatio: number | null;
}

export interface UnexpectedSubcategoryAnalyticsItem {
  subcategoryId: string | null;
  label: string;
  amountMinor: number;
  shareRatio: number;
  transactionCount: number;
}

export interface UnexpectedCategoryAnalyticsItem {
  categoryId: CategoryId;
  label: string;
  color: string;
  icon: string;
  amountMinor: number;
  shareRatio: number;
  transactionCount: number;
  subcategories: UnexpectedSubcategoryAnalyticsItem[];
}

export interface UnexpectedExpenseAnalytics {
  amountMinor: number;
  grossExpenseMinor: number;
  shareRatio: number;
  transactionCount: number;
  categories: UnexpectedCategoryAnalyticsItem[];
}

export interface MerchantAnalyticsItem {
  merchant: string;
  netSpentMinor: number;
  transactionCount: number;
  shareRatio: number;
}

export interface MonthAnalytics {
  budget: MonthlyBudgetSummary;
  categories: CategoryAnalyticsItem[];
  unexpected: UnexpectedExpenseAnalytics;
  merchants: MerchantAnalyticsItem[];
  spendingDayCount: number;
  averagePerSpendingDayMinor: number;
  largestExpense: Transaction | null;
}

export interface MonthlySeriesPoint {
  month: MonthKey;
  label: string;
  shortLabel: string;
  grossExpenseMinor: number;
  refundMinor: number;
  netSpentMinor: number;
  recurringReservedMinor: number;
  budgetMinor: number;
  usedRatio: number | null;
  isAnchorMonth: boolean;
}

export interface SixMonthSeriesOptions {
  currency: CurrencyCode;
  budgetMinor: number;
  recurringExpenses?: readonly RecurringExpense[];
  reserveRecurringExpenses?: boolean;
  asOfDate?: LocalDate;
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function getBudgetHealth(
  usedRatio: number | null,
  warningRatio: number,
  dangerRatio: number,
): BudgetHealth {
  if (usedRatio === null) {
    return 'not_set';
  }
  if (usedRatio > 1) {
    return 'over';
  }
  if (usedRatio >= dangerRatio) {
    return 'danger';
  }
  if (usedRatio >= warningRatio) {
    return 'watch';
  }
  return 'healthy';
}

function normalizeThresholds(
  warningRatio: number | undefined,
  dangerRatio: number | undefined,
): { warning: number; danger: number } {
  const warning = Math.max(0, Math.min(1, warningRatio ?? 0.7));
  const danger = Math.max(
    warning,
    Math.min(1, dangerRatio ?? 0.9),
  );
  return { warning, danger };
}

function getCalendarProgress(
  month: MonthKey,
  asOfDate: LocalDate,
): { elapsedDays: number; daysRemaining: number } {
  const totalDays = daysInMonth(month);
  const currentMonth = toMonthKey(asOfDate);

  if (month < currentMonth) {
    return { elapsedDays: totalDays, daysRemaining: 0 };
  }
  if (month > currentMonth) {
    return { elapsedDays: 0, daysRemaining: totalDays };
  }

  const day = Number(asOfDate.slice(8, 10));
  return {
    elapsedDays: day,
    daysRemaining: totalDays - day + 1,
  };
}

function transactionIsInMonth(
  transaction: Transaction,
  month: MonthKey,
): boolean {
  return (
    isLocalDate(transaction.date) && transaction.date.startsWith(`${month}-`)
  );
}

export function calculateMonthlyBudget(
  input: MonthlyBudgetInput,
): MonthlyBudgetSummary {
  if (!isMonthKey(input.month)) {
    throw new Error(`Invalid month key: ${input.month}`);
  }

  const now = new Date();
  const asOfDate =
    input.asOfDate && isLocalDate(input.asOfDate)
      ? input.asOfDate
      : formatLocalDate(now);
  const budgetMinor =
    Number.isSafeInteger(input.budgetMinor) && input.budgetMinor > 0
      ? input.budgetMinor
      : 0;
  const monthTransactions = input.transactions.filter((transaction) =>
    transactionIsInMonth(transaction, input.month),
  );
  const currencyTransactions = monthTransactions.filter(
    (transaction) => transaction.currency === input.currency,
  );
  const countedTransactions = currencyTransactions.filter(
    (transaction) => getSpendingImpactMinor(transaction, input.currency) !== 0,
  );
  const grossExpenseMinor = countedTransactions.reduce(
    (total, transaction) =>
      transaction.kind === 'expense'
        ? total + Math.abs(transaction.amountMinor)
        : total,
    0,
  );
  const refundMinor = countedTransactions.reduce(
    (total, transaction) =>
      transaction.kind === 'refund'
        ? total + Math.abs(transaction.amountMinor)
        : total,
    0,
  );
  const netSpentMinor = grossExpenseMinor - refundMinor;
  const shouldReserveRecurring =
    input.reserveRecurringExpenses ?? true;
  const recurringReservedMinor = shouldReserveRecurring
    ? calculateRecurringReserveMinor(
        input.recurringExpenses ?? [],
        input.transactions,
        input.month,
        {
          currency: input.currency,
          asOfDate,
        },
      )
    : 0;
  const committedMinor = netSpentMinor + recurringReservedMinor;
  const remainingMinor = budgetMinor - committedMinor;
  const usedRatio = safeRatio(committedMinor, budgetMinor);
  const thresholds = normalizeThresholds(
    input.warningRatio,
    input.dangerRatio,
  );
  const { elapsedDays, daysRemaining } = getCalendarProgress(
    input.month,
    asOfDate,
  );
  const dailyAvailableMinor =
    daysRemaining > 0
      ? Math.floor(Math.max(0, remainingMinor) / daysRemaining)
      : 0;
  const projectedActualMinor =
    elapsedDays > 0
      ? Math.max(
          netSpentMinor,
          Math.round(
            (Math.max(0, netSpentMinor) / elapsedDays) *
              daysInMonth(input.month),
          ),
        )
      : 0;
  const projectedMonthEndMinor =
    projectedActualMinor + recurringReservedMinor;

  return {
    month: input.month,
    currency: input.currency,
    budgetMinor,
    grossExpenseMinor,
    refundMinor,
    netSpentMinor,
    recurringReservedMinor,
    committedMinor,
    remainingMinor,
    usedRatio,
    progressRatio: usedRatio === null ? 0 : clampRatio(usedRatio),
    health: getBudgetHealth(
      usedRatio,
      thresholds.warning,
      thresholds.danger,
    ),
    countedTransactionCount: countedTransactions.length,
    foreignCurrencyTransactionCount:
      monthTransactions.filter(
        (transaction) =>
          transaction.currency !== input.currency &&
          getSpendingImpactMinor(transaction) !== 0,
      ).length,
    elapsedDays,
    daysRemaining,
    dailyAvailableMinor,
    projectedMonthEndMinor,
  };
}

export function calculateBudgetFromSettings(
  transactions: readonly Transaction[],
  settings: AppSettings,
  month: MonthKey,
  recurringExpenses: readonly RecurringExpense[] = [],
  asOfDate?: LocalDate,
): MonthlyBudgetSummary {
  return calculateMonthlyBudget({
    transactions,
    month,
    budgetMinor: settings.monthlyBudgetMinor,
    currency: settings.currency,
    recurringExpenses,
    reserveRecurringExpenses: settings.reserveRecurringExpenses,
    asOfDate,
    warningRatio: settings.budgetWarningRatio,
    dangerRatio: settings.budgetDangerRatio,
  });
}

export function calculateCategoryAnalytics(
  input: CategoryAnalyticsInput,
): CategoryAnalyticsItem[] {
  if (!isMonthKey(input.month)) {
    throw new Error(`Invalid month key: ${input.month}`);
  }

  const buckets = new Map<
    CategoryId,
    {
      grossExpenseMinor: number;
      refundMinor: number;
      transactionCount: number;
    }
  >();

  for (const transaction of input.transactions) {
    const impact = getSpendingImpactMinor(transaction, input.currency);
    if (
      impact === 0 ||
      !transactionIsInMonth(transaction, input.month)
    ) {
      continue;
    }

    const bucket = buckets.get(transaction.categoryId) ?? {
      grossExpenseMinor: 0,
      refundMinor: 0,
      transactionCount: 0,
    };
    if (transaction.kind === 'expense') {
      bucket.grossExpenseMinor += Math.abs(transaction.amountMinor);
    } else if (transaction.kind === 'refund') {
      bucket.refundMinor += Math.abs(transaction.amountMinor);
    }
    bucket.transactionCount += 1;
    buckets.set(transaction.categoryId, bucket);
  }

  const categories = input.categories ?? CATEGORY_DEFINITIONS;
  const categoryItems = categories.flatMap((definition) => {
    const bucket = buckets.get(definition.id);
    const budgetMinor = input.categoryBudgetsMinor?.[definition.id];
    if (!bucket && budgetMinor === undefined) {
      return [];
    }

    const grossExpenseMinor = bucket?.grossExpenseMinor ?? 0;
    const refundMinor = bucket?.refundMinor ?? 0;
    const netSpentMinor = grossExpenseMinor - refundMinor;
    const normalizedBudget =
      Number.isSafeInteger(budgetMinor) && (budgetMinor ?? 0) >= 0
        ? (budgetMinor ?? 0)
        : null;

    return [
      {
        categoryId: definition.id,
        label: definition.label,
        color: definition.color,
        icon: definition.icon,
        grossExpenseMinor,
        refundMinor,
        netSpentMinor,
        chartAmountMinor: Math.max(0, netSpentMinor),
        shareRatio: 0,
        transactionCount: bucket?.transactionCount ?? 0,
        budgetMinor: normalizedBudget,
        budgetRemainingMinor:
          normalizedBudget === null
            ? null
            : normalizedBudget - netSpentMinor,
        budgetUsedRatio:
          normalizedBudget === null
            ? null
            : safeRatio(netSpentMinor, normalizedBudget),
      } satisfies CategoryAnalyticsItem,
    ];
  });
  const chartTotal = categoryItems.reduce(
    (total, item) => total + item.chartAmountMinor,
    0,
  );

  return categoryItems
    .map((item) => ({
      ...item,
      shareRatio:
        chartTotal > 0 ? item.chartAmountMinor / chartTotal : 0,
    }))
    .sort(
      (left, right) =>
        right.chartAmountMinor - left.chartAmountMinor ||
        categories.findIndex(
          (category) => category.id === left.categoryId,
        ) -
          categories.findIndex(
            (category) => category.id === right.categoryId,
          ),
    );
}

export function calculateUnexpectedExpenseAnalytics(
  input: CategoryAnalyticsInput,
): UnexpectedExpenseAnalytics {
  if (!isMonthKey(input.month)) {
    throw new Error(`Invalid month key: ${input.month}`);
  }

  type SubcategoryBucket = {
    amountMinor: number;
    transactionCount: number;
  };
  type CategoryBucket = {
    amountMinor: number;
    transactionCount: number;
    subcategories: Map<string, SubcategoryBucket>;
  };

  const categories = input.categories ?? CATEGORY_DEFINITIONS;
  const buckets = new Map<CategoryId, CategoryBucket>();
  let grossExpenseMinor = 0;

  for (const transaction of input.transactions) {
    const impact = getSpendingImpactMinor(transaction, input.currency);
    if (
      transaction.kind !== 'expense' ||
      impact === 0 ||
      !transactionIsInMonth(transaction, input.month)
    ) {
      continue;
    }

    grossExpenseMinor += impact;
    if (transaction.isUnexpected !== true) {
      continue;
    }

    const category =
      buckets.get(transaction.categoryId) ?? {
        amountMinor: 0,
        transactionCount: 0,
        subcategories: new Map<string, SubcategoryBucket>(),
      };
    category.amountMinor += impact;
    category.transactionCount += 1;

    const subcategoryKey = transaction.subcategoryId ?? '';
    const subcategory =
      category.subcategories.get(subcategoryKey) ?? {
        amountMinor: 0,
        transactionCount: 0,
      };
    subcategory.amountMinor += impact;
    subcategory.transactionCount += 1;
    category.subcategories.set(subcategoryKey, subcategory);
    buckets.set(transaction.categoryId, category);
  }

  const amountMinor = Array.from(buckets.values()).reduce(
    (total, bucket) => total + bucket.amountMinor,
    0,
  );
  const categoryItems = categories.flatMap((definition) => {
    const bucket = buckets.get(definition.id);
    if (!bucket) {
      return [];
    }

    const subcategories = Array.from(bucket.subcategories.entries())
      .sort(
        ([, left], [, right]) =>
          right.amountMinor - left.amountMinor ||
          right.transactionCount - left.transactionCount,
      )
      .map(([subcategoryId, subcategory]) => {
        const normalizedSubcategoryId = subcategoryId || null;
        const label = normalizedSubcategoryId
          ? definition.subcategories.find(
              (item) => item.id === normalizedSubcategoryId,
            )?.label ?? '其他子分类'
          : '未细分';
        return {
          subcategoryId: normalizedSubcategoryId,
          label,
          amountMinor: subcategory.amountMinor,
          shareRatio:
            bucket.amountMinor > 0
              ? subcategory.amountMinor / bucket.amountMinor
              : 0,
          transactionCount: subcategory.transactionCount,
        } satisfies UnexpectedSubcategoryAnalyticsItem;
      });

    return [
      {
        categoryId: definition.id,
        label: definition.label,
        color: definition.color,
        icon: definition.icon,
        amountMinor: bucket.amountMinor,
        shareRatio: amountMinor > 0 ? bucket.amountMinor / amountMinor : 0,
        transactionCount: bucket.transactionCount,
        subcategories,
      } satisfies UnexpectedCategoryAnalyticsItem,
    ];
  });

  categoryItems.sort(
    (left, right) =>
      right.amountMinor - left.amountMinor ||
      categories.findIndex((category) => category.id === left.categoryId) -
        categories.findIndex((category) => category.id === right.categoryId),
  );

  return {
    amountMinor,
    grossExpenseMinor,
    shareRatio:
      grossExpenseMinor > 0 ? amountMinor / grossExpenseMinor : 0,
    transactionCount: Array.from(buckets.values()).reduce(
      (total, bucket) => total + bucket.transactionCount,
      0,
    ),
    categories: categoryItems,
  };
}

export function calculateMerchantAnalytics(
  transactions: readonly Transaction[],
  month: MonthKey,
  currency: CurrencyCode,
  limit = 5,
): MerchantAnalyticsItem[] {
  const buckets = new Map<
    string,
    { merchant: string; netSpentMinor: number; transactionCount: number }
  >();

  for (const transaction of transactions) {
    const impact = getSpendingImpactMinor(transaction, currency);
    if (impact === 0 || !transactionIsInMonth(transaction, month)) {
      continue;
    }

    const merchant = transaction.merchant.trim() || '未填写';
    const key = merchant.normalize('NFKC').toLocaleLowerCase();
    const bucket = buckets.get(key) ?? {
      merchant,
      netSpentMinor: 0,
      transactionCount: 0,
    };
    bucket.netSpentMinor += impact;
    bucket.transactionCount += 1;
    buckets.set(key, bucket);
  }

  const sorted = Array.from(buckets.values())
    .filter((item) => item.netSpentMinor > 0)
    .sort(
      (left, right) =>
        right.netSpentMinor - left.netSpentMinor ||
        right.transactionCount - left.transactionCount,
    )
    .slice(0, Math.max(0, Math.floor(limit)));
  const total = sorted.reduce(
    (sum, item) => sum + item.netSpentMinor,
    0,
  );

  return sorted.map((item) => ({
    ...item,
    shareRatio: total > 0 ? item.netSpentMinor / total : 0,
  }));
}

export function calculateMonthAnalytics(
  budgetInput: MonthlyBudgetInput,
  categoryBudgetsMinor?: Partial<Record<CategoryId, number>>,
  categoryDefinitions?: readonly CategoryDefinition[],
): MonthAnalytics {
  const budget = calculateMonthlyBudget(budgetInput);
  const categories = calculateCategoryAnalytics({
    transactions: budgetInput.transactions,
    month: budgetInput.month,
    currency: budgetInput.currency,
    categories: categoryDefinitions,
    categoryBudgetsMinor,
  });
  const unexpected = calculateUnexpectedExpenseAnalytics({
    transactions: budgetInput.transactions,
    month: budgetInput.month,
    currency: budgetInput.currency,
    categories: categoryDefinitions,
  });
  const merchants = calculateMerchantAnalytics(
    budgetInput.transactions,
    budgetInput.month,
    budgetInput.currency,
  );
  const countedExpenses = budgetInput.transactions.filter(
    (transaction) =>
      transaction.kind === 'expense' &&
      getSpendingImpactMinor(transaction, budgetInput.currency) > 0 &&
      transactionIsInMonth(transaction, budgetInput.month),
  );
  const spendingDayCount = new Set(
    countedExpenses.map((transaction) => transaction.date),
  ).size;
  const largestExpense =
    countedExpenses.reduce<Transaction | null>(
      (largest, transaction) =>
        !largest || transaction.amountMinor > largest.amountMinor
          ? transaction
          : largest,
      null,
    );

  return {
    budget,
    categories,
    unexpected,
    merchants,
    spendingDayCount,
    averagePerSpendingDayMinor:
      spendingDayCount > 0
        ? Math.round(budget.netSpentMinor / spendingDayCount)
        : 0,
    largestExpense,
  };
}

export function buildSixMonthSeries(
  transactions: readonly Transaction[],
  anchorMonth: MonthKey,
  options: SixMonthSeriesOptions,
): MonthlySeriesPoint[] {
  if (!isMonthKey(anchorMonth)) {
    throw new Error(`Invalid month key: ${anchorMonth}`);
  }

  return trailingMonthKeys(anchorMonth, 6).map((month) => {
    const summary = calculateMonthlyBudget({
      transactions,
      month,
      budgetMinor: options.budgetMinor,
      currency: options.currency,
      recurringExpenses: options.recurringExpenses,
      reserveRecurringExpenses: options.reserveRecurringExpenses,
      asOfDate: options.asOfDate,
    });
    const monthNumber = Number(month.slice(5, 7));

    return {
      month,
      label: `${month.slice(0, 4)}年${monthNumber}月`,
      shortLabel: `${monthNumber}月`,
      grossExpenseMinor: summary.grossExpenseMinor,
      refundMinor: summary.refundMinor,
      netSpentMinor: summary.netSpentMinor,
      recurringReservedMinor: summary.recurringReservedMinor,
      budgetMinor: summary.budgetMinor,
      usedRatio:
        summary.budgetMinor > 0
          ? summary.netSpentMinor / summary.budgetMinor
          : null,
      isAnchorMonth: month === anchorMonth,
    };
  });
}

export function getCurrentMonthKey(now = new Date()): MonthKey {
  return formatMonthKey(now);
}

export function getCategoryChartTotal(
  items: readonly CategoryAnalyticsItem[],
): number {
  return items.reduce((total, item) => total + item.chartAmountMinor, 0);
}

export function getCategoryLabel(
  categoryId: CategoryId,
  categories?: readonly CategoryDefinition[],
): string {
  return getCategoryDefinition(categoryId, categories).label;
}
