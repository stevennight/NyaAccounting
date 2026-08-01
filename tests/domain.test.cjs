const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const domain = require('../.test-build/domain/index.js');

const REFERENCE_DATE = '2026-07-27';
const REFERENCE_MONTH = '2026-07';

describe('spending rules', () => {
  const dataset = domain.createDemoDataset(REFERENCE_DATE);

  test('only confirmed expenses and refunds affect spending', () => {
    const byKind = new Map();
    for (const transaction of dataset.transactions.filter((item) =>
      item.date.startsWith(REFERENCE_MONTH),
    )) {
      const impact = domain.getSpendingImpactMinor(transaction, 'CNY');
      byKind.set(transaction.kind, (byKind.get(transaction.kind) ?? 0) + impact);
    }

    assert.ok((byKind.get('expense') ?? 0) > 0);
    assert.equal(byKind.get('refund'), -2_900);
    assert.equal(byKind.get('transfer'), 0);
    assert.equal(byKind.get('repayment'), 0);
    assert.equal(byKind.get('investment'), 0);

    const pending = dataset.transactions.find(
      (transaction) => transaction.status === 'pending',
    );
    assert.ok(pending);
    assert.equal(domain.getSpendingImpactMinor(pending, 'CNY'), 0);
  });

  test('does not mix currencies or unconfirmed statuses into spending', () => {
    const confirmed = dataset.transactions.find(
      (transaction) =>
        transaction.status === 'confirmed' &&
        transaction.kind === 'expense' &&
        transaction.currency === 'CNY' &&
        transaction.date.startsWith(REFERENCE_MONTH),
    );
    assert.ok(confirmed);

    const foreign = {
      ...confirmed,
      id: 'txn_foreign',
      currency: 'USD',
    };
    const pending = {
      ...confirmed,
      id: 'txn_pending',
      status: 'pending',
    };
    const failed = {
      ...confirmed,
      id: 'txn_failed',
      status: 'failed',
    };
    const summary = domain.calculateMonthlyBudget({
      transactions: [confirmed, foreign, pending, failed],
      month: REFERENCE_MONTH,
      budgetMinor: 500_000,
      currency: 'CNY',
      reserveRecurringExpenses: false,
      asOfDate: REFERENCE_DATE,
    });

    assert.equal(summary.grossExpenseMinor, confirmed.amountMinor);
    assert.equal(summary.countedTransactionCount, 1);
    assert.equal(summary.foreignCurrencyTransactionCount, 1);
    assert.equal(domain.getSpendingImpactMinor(foreign, 'CNY'), 0);
    assert.equal(domain.getSpendingImpactMinor(pending, 'CNY'), 0);
    assert.equal(domain.getSpendingImpactMinor(failed, 'CNY'), 0);
  });

  test('budget reserves an unposted recurring charge', () => {
    const summary = domain.calculateBudgetFromSettings(
      dataset.transactions,
      dataset.settings,
      REFERENCE_MONTH,
      dataset.recurringExpenses,
      REFERENCE_DATE,
    );

    assert.equal(summary.recurringReservedMinor, 7_800);
    assert.equal(
      summary.committedMinor,
      summary.netSpentMinor + summary.recurringReservedMinor,
    );
    assert.equal(
      summary.remainingMinor,
      summary.budgetMinor - summary.committedMinor,
    );
  });
});

describe('draft confirmation and duplicate detection', () => {
  test('normalizes an AI-shaped draft into integer minor units', () => {
    const draft = domain.normalizeTransactionDraft(
      {
        ...domain.createDemoDraft(REFERENCE_DATE),
        amount: '36.80',
        amountMinor: undefined,
      },
      {
        defaultCurrency: 'CNY',
        defaultDate: REFERENCE_DATE,
        defaultStatus: 'confirmed',
      },
    );
    const result = domain.confirmTransactionDraft(draft);

    assert.equal(result.ok, true);
    assert.equal(result.transaction.amountMinor, 3_680);
    assert.equal(result.transaction.date, REFERENCE_DATE);
    assert.equal(result.transaction.categoryId, 'food');
  });

  test('keeps seconds from a full Alipay transaction datetime', () => {
    const draft = domain.normalizeTransactionDraft(
      {
        ...domain.createDemoDraft(REFERENCE_DATE),
        date: '2026年7月31日 08:09:10',
      },
      {
        defaultCurrency: 'CNY',
        defaultDate: REFERENCE_DATE,
        defaultStatus: 'confirmed',
      },
    );
    const result = domain.confirmTransactionDraft(draft);

    assert.equal(draft.date, '2026-07-31');
    assert.equal(draft.time, '08:09:10');
    assert.equal(result.ok, true);
    assert.equal(result.transaction.time, '08:09:10');
  });

  test('normalizes minute-only and legacy tagged times to seconds', () => {
    const minuteDraft = domain.normalizeTransactionDraft(
      {
        ...domain.createDemoDraft(REFERENCE_DATE),
        time: '8:09',
      },
      { defaultDate: REFERENCE_DATE },
    );
    const legacyDraft = domain.normalizeTransactionDraft(
      {
        ...domain.createDemoDraft(REFERENCE_DATE),
        tags: ['time:09:08', '支付宝'],
      },
      { defaultDate: REFERENCE_DATE },
    );

    assert.equal(minuteDraft.time, '08:09:00');
    assert.equal(legacyDraft.time, '09:08:00');
    assert.deepEqual(legacyDraft.tags, ['支付宝']);
  });

  test('orders transactions on the same date by transaction time', () => {
    const existing = domain.createDemoDataset(REFERENCE_DATE).transactions[0];
    const earlier = { ...existing, time: '08:00:01' };
    const later = { ...existing, time: '20:15:30' };

    assert.ok(domain.compareTransactionDateTime(earlier, later) < 0);
    assert.equal(domain.getTransactionLocalTime(later), '20:15:30');
  });

  test('blocks a draft with missing required fields', () => {
    const draft = domain.normalizeTransactionDraft(
      {
        kind: 'expense',
        status: 'confirmed',
        amountMinor: null,
        date: REFERENCE_DATE,
        merchant: '',
      },
      { defaultCurrency: 'CNY' },
    );

    const result = domain.confirmTransactionDraft(draft);
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === 'missing_amount' || issue.code === 'missing_merchant',
      ),
    );
  });

  test('matches an identical source fingerprint as a duplicate', () => {
    const existing = domain.createDemoDataset(REFERENCE_DATE).transactions[0];
    const candidate = {
      ...existing,
      id: 'txn_candidate',
      createdAt: '2026-07-27T13:00:00.000Z',
      updatedAt: '2026-07-27T13:00:00.000Z',
    };
    const matches = domain.findDuplicateCandidates(candidate, [existing]);

    assert.equal(matches.length, 1);
    assert.equal(matches[0].score, 1);
    assert.deepEqual(matches[0].reasons, ['source_fingerprint']);
  });
});

describe('analytics', () => {
  const dataset = domain.createDemoDataset(REFERENCE_DATE);

  test('produces category totals and a six-month chart series', () => {
    const categories = domain.calculateCategoryAnalytics({
      transactions: dataset.transactions,
      month: REFERENCE_MONTH,
      currency: 'CNY',
    });
    const series = domain.buildSixMonthSeries(
      dataset.transactions,
      REFERENCE_MONTH,
      {
        currency: 'CNY',
        budgetMinor: dataset.settings.monthlyBudgetMinor,
        recurringExpenses: dataset.recurringExpenses,
        reserveRecurringExpenses: true,
        asOfDate: REFERENCE_DATE,
      },
    );

    assert.ok(categories.some((category) => category.categoryId === 'food'));
    assert.ok(categories.some((category) => category.categoryId === 'digital'));
    assert.equal(series.length, 6);
    assert.equal(series.at(-1).month, REFERENCE_MONTH);
    assert.equal(series.at(-1).isAnchorMonth, true);
  });

  test('keeps category shares bounded when refunds exceed a category expense', () => {
    const base = dataset.transactions.find(
      (transaction) =>
        transaction.status === 'confirmed' &&
        transaction.kind === 'expense' &&
        transaction.currency === 'CNY' &&
        transaction.date.startsWith(REFERENCE_MONTH),
    );
    assert.ok(base);

    const categories = domain.calculateCategoryAnalytics({
      transactions: [
        {
          ...base,
          id: 'txn_food_expense',
          categoryId: 'food',
          amountMinor: 1_000,
        },
        {
          ...base,
          id: 'txn_food_refund',
          categoryId: 'food',
          kind: 'refund',
          amountMinor: 1_500,
        },
        {
          ...base,
          id: 'txn_digital_expense',
          categoryId: 'digital',
          amountMinor: 2_000,
        },
      ],
      month: REFERENCE_MONTH,
      currency: 'CNY',
    });
    const food = categories.find((category) => category.categoryId === 'food');
    const digital = categories.find(
      (category) => category.categoryId === 'digital',
    );

    assert.ok(food);
    assert.ok(digital);
    assert.equal(food.chartAmountMinor, 0);
    assert.equal(food.shareRatio, 0);
    assert.equal(digital.shareRatio, 1);
    assert.ok(
      categories.every(
        (category) =>
          category.shareRatio >= 0 && category.shareRatio <= 1,
      ),
    );
  });
});

describe('currency minor units', () => {
  test('converts zero- and three-decimal currencies correctly', () => {
    assert.equal(domain.majorToMinor(1_234, 'JPY'), 1_234);
    assert.equal(domain.minorToMajor(1_234, 'JPY'), 1_234);
    assert.equal(domain.majorToMinor(1.234, 'KWD'), 1_234);
    assert.equal(domain.minorToMajor(1_234, 'KWD'), 1.234);
  });
});

describe('recurring expense matching', () => {
  test('matches a unique subscription only when amount, currency and identity agree', () => {
    const dataset = domain.createDemoDataset(REFERENCE_DATE);
    const match = domain.findRecurringExpenseMatch(
      {
        amountMinor: 14_000,
        currency: 'CNY',
        merchant: 'Cursor',
        description: 'Cursor Pro 月费',
        categoryId: 'digital',
      },
      dataset.recurringExpenses,
    );

    assert.equal(match?.id, 'demo_rec_cursor');
    assert.equal(
      domain.findRecurringExpenseMatch(
        {
          amountMinor: 14_001,
          currency: 'CNY',
          merchant: 'Cursor',
          categoryId: 'digital',
        },
        dataset.recurringExpenses,
      ),
      null,
    );
  });

  test('does not guess when more than one fixed expense matches', () => {
    const dataset = domain.createDemoDataset(REFERENCE_DATE);
    const cursor = dataset.recurringExpenses.find(
      (expense) => expense.id === 'demo_rec_cursor',
    );
    assert.ok(cursor);

    const match = domain.findRecurringExpenseMatch(
      {
        amountMinor: cursor.amountMinor,
        currency: cursor.currency,
        merchant: cursor.merchant ?? cursor.name,
        categoryId: cursor.categoryId,
      },
      [
        cursor,
        {
          ...cursor,
          id: 'duplicate_subscription',
        },
      ],
    );

    assert.equal(match, null);
  });
});
