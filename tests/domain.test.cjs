const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const domain = require('../.test-build-tests/domain/index.js');

const REFERENCE_DATE = '2026-07-27';
const REFERENCE_MONTH = '2026-07';
const CUSTOM_CATEGORIES = [
  {
    id: 'meals',
    label: '餐饮',
    shortLabel: '餐饮',
    color: '#F97316',
    icon: 'restaurant',
    subcategories: [{ id: 'coffee', label: '咖啡' }],
  },
  {
    id: 'work_tools',
    label: '工作工具',
    shortLabel: '工具',
    color: '#2563EB',
    icon: 'laptop',
    subcategories: [{ id: 'hosting', label: '托管服务' }],
  },
];

describe('settings normalization', () => {
  test('keeps old AI settings compatible and accepts a reasoning choice', () => {
    const legacy = domain.normalizeAppSettings({
      ai: { model: 'gpt-5.6-sol' },
    });
    const configured = domain.normalizeAppSettings({
      ai: { model: 'gpt-5.6-sol', reasoningEffort: 'none' },
    });
    const invalid = domain.normalizeAppSettings({
      ai: { reasoningEffort: 'fastest' },
    });

    assert.equal(legacy.ai.reasoningEffort, 'auto');
    assert.equal(configured.ai.reasoningEffort, 'none');
    assert.equal(invalid.ai.reasoningEffort, 'auto');
    assert.equal(legacy.ai.maxConcurrentRecognitions, 3);
  });

  test('clamps batch recognition concurrency to the supported range', () => {
    assert.equal(
      domain.normalizeAppSettings({ ai: { maxConcurrentRecognitions: 99 } })
        .ai.maxConcurrentRecognitions,
      8,
    );
    assert.equal(
      domain.normalizeAppSettings({ ai: { maxConcurrentRecognitions: 0 } })
        .ai.maxConcurrentRecognitions,
      1,
    );
    assert.equal(
      domain.normalizeAppSettings({ ai: { maxConcurrentRecognitions: 2.6 } })
        .ai.maxConcurrentRecognitions,
      3,
    );
  });

  test('migrates old settings to independent default category copies', () => {
    const first = domain.normalizeAppSettings({ ai: {} });
    const second = domain.normalizeAppSettings({ ai: {} });

    assert.deepEqual(
      first.categories.map((category) => category.id),
      domain.CATEGORY_IDS,
    );
    assert.notEqual(first.categories, second.categories);
    assert.notEqual(
      first.categories[0].subcategories,
      second.categories[0].subcategories,
    );
    first.categories[0].label = '已修改';
    assert.equal(second.categories[0].label, '吃喝');
  });

  test('keeps a valid custom taxonomy and removes duplicate definitions', () => {
    const settings = domain.normalizeAppSettings({
      categories: [
        ...CUSTOM_CATEGORIES,
        { ...CUSTOM_CATEGORIES[0], label: '重复分类' },
      ],
      defaultCategoryId: 'work_tools',
      categoryBudgetsMinor: {
        work_tools: 50_000,
        food: 10_000,
      },
      ai: {},
    });

    assert.deepEqual(
      settings.categories.map((category) => category.id),
      ['meals', 'work_tools'],
    );
    assert.equal(settings.defaultCategoryId, 'work_tools');
    assert.deepEqual(settings.categoryBudgetsMinor, {
      work_tools: 50_000,
    });
    assert.equal(
      domain.getCategoryDefinition('work_tools', settings.categories).label,
      '工作工具',
    );
  });
});

describe('concurrency helpers', () => {
  test('limits active work and preserves input order', async () => {
    let active = 0;
    let peak = 0;
    const results = await domain.mapWithConcurrency(
      [40, 10, 30, 20],
      2,
      async (delay, index) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        return `${index}:${delay}`;
      },
    );

    assert.equal(peak, 2);
    assert.deepEqual(results, ['0:40', '1:10', '2:30', '3:20']);
  });

  test('does not start more workers than items', async () => {
    const results = await domain.mapWithConcurrency(
      ['a', 'b'],
      8,
      async (value) => value.toUpperCase(),
    );
    assert.deepEqual(results, ['A', 'B']);
  });
});

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

  test('validates and confirms a custom category and subcategory', () => {
    const draft = domain.normalizeTransactionDraft(
      {
        ...domain.createDemoDraft(REFERENCE_DATE),
        categoryId: 'work_tools',
        subcategoryId: 'hosting',
      },
      {
        categories: CUSTOM_CATEGORIES,
        defaultDate: REFERENCE_DATE,
      },
    );
    const result = domain.confirmTransactionDraft(draft, {
      categories: CUSTOM_CATEGORIES,
    });

    assert.equal(draft.categoryId, 'work_tools');
    assert.equal(draft.subcategoryId, 'hosting');
    assert.equal(result.ok, true);
    assert.equal(result.transaction.categoryId, 'work_tools');
    assert.equal(result.transaction.subcategoryId, 'hosting');

    const mismatched = {
      ...draft,
      subcategoryId: 'coffee',
    };
    const mismatchedResult = domain.confirmTransactionDraft(mismatched, {
      categories: CUSTOM_CATEGORIES,
    });
    assert.equal(mismatchedResult.ok, true);
    assert.equal(mismatchedResult.transaction.subcategoryId, undefined);
    assert.ok(
      domain
        .validateTransactionDraft(mismatched, CUSTOM_CATEGORIES)
        .some((issue) => issue.field === 'subcategoryId'),
    );

    const unknownCategoryResult = domain.confirmTransactionDraft(
      { ...draft, categoryId: 'food' },
      { categories: CUSTOM_CATEGORIES },
    );
    assert.equal(unknownCategoryResult.ok, false);
    assert.ok(
      unknownCategoryResult.issues.some(
        (issue) => issue.code === 'invalid_category',
      ),
    );
  });

  test('does not copy a description into an unknown merchant', () => {
    const draft = domain.normalizeTransactionDraft(
      {
        ...domain.createDemoDraft(REFERENCE_DATE),
        merchant: null,
        description: '冰拿铁与三明治',
      },
      { defaultDate: REFERENCE_DATE },
    );
    const result = domain.confirmTransactionDraft(draft);

    assert.equal(draft.merchant, '');
    assert.equal(draft.description, '冰拿铁与三明治');
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === 'missing_merchant' && issue.field === 'merchant',
      ),
    );
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

  test('matches similar merchant and description text within five minutes', () => {
    const base = domain.createDemoDataset(REFERENCE_DATE).transactions[0];
    const existing = {
      ...base,
      id: 'txn_existing_near_time',
      amountMinor: 3_680,
      date: REFERENCE_DATE,
      time: '12:30:00',
      merchant: '上海星巴克咖啡有限公司',
      description: '大杯冰拿铁和火腿三明治',
      paymentChannel: 'unknown',
      fundingInstrument: undefined,
      sourceFingerprint: undefined,
    };
    const candidate = {
      ...existing,
      id: 'txn_candidate_near_time',
      time: '12:34:59',
      merchant: '星巴克咖啡旗舰店',
      description: '大杯冰拿铁、火腿三明治套餐',
    };
    const matches = domain.findDuplicateCandidates(candidate, [existing]);

    assert.equal(matches.length, 1);
    assert.ok(matches[0].score >= 0.72);
    assert.ok(matches[0].reasons.includes('near_time'));
    assert.ok(matches[0].reasons.includes('similar_merchant'));
    assert.ok(matches[0].reasons.includes('similar_description'));
  });

  test('matches an exact timestamp even when OCR text differs', () => {
    const base = domain.createDemoDataset(REFERENCE_DATE).transactions[0];
    const existing = {
      ...base,
      id: 'txn_existing_exact_time',
      amountMinor: 6_600,
      date: REFERENCE_DATE,
      time: '09:08:07',
      merchant: '识别前商户',
      description: undefined,
      paymentChannel: 'unknown',
      fundingInstrument: undefined,
      sourceFingerprint: undefined,
    };
    const candidate = {
      ...existing,
      id: 'txn_candidate_exact_time',
      merchant: '完全不同的识别文字',
    };
    const matches = domain.findDuplicateCandidates(candidate, [existing]);

    assert.equal(matches.length, 1);
    assert.ok(matches[0].score >= 0.72);
    assert.ok(matches[0].reasons.includes('same_time'));
  });

  test('uses a default date window of two days', () => {
    const base = domain.createDemoDataset(REFERENCE_DATE).transactions[0];
    const existing = {
      ...base,
      id: 'txn_existing_date_window',
      date: REFERENCE_DATE,
      merchant: 'Cursor',
      description: 'Cursor Pro 月费',
      sourceFingerprint: undefined,
    };
    const withinWindow = {
      ...existing,
      id: 'txn_candidate_two_days',
      date: '2026-07-29',
    };
    const outsideWindow = {
      ...existing,
      id: 'txn_candidate_three_days',
      date: '2026-07-30',
    };

    assert.equal(
      domain.findDuplicateCandidates(withinWindow, [existing]).length,
      1,
    );
    assert.equal(
      domain.findDuplicateCandidates(outsideWindow, [existing]).length,
      0,
    );
  });

  test('excludes the transaction with the same id', () => {
    const existing = domain.createDemoDataset(REFERENCE_DATE).transactions[0];

    assert.equal(
      domain.findDuplicateCandidates({ ...existing }, [existing]).length,
      0,
    );
  });

  test('does not match amount and date alone when text is unrelated', () => {
    const base = domain.createDemoDataset(REFERENCE_DATE).transactions[0];
    const existing = {
      ...base,
      id: 'txn_existing_unrelated',
      amountMinor: 2_880,
      date: REFERENCE_DATE,
      time: undefined,
      merchant: '城市地铁',
      description: '交通卡充值',
      paymentChannel: 'unknown',
      fundingInstrument: undefined,
      sourceFingerprint: undefined,
    };
    const candidate = {
      ...existing,
      id: 'txn_candidate_unrelated',
      merchant: '社区面包店',
      description: '生日蛋糕',
    };

    assert.equal(
      domain.findDuplicateCandidates(candidate, [existing]).length,
      0,
    );
  });

  test('reduces same-day confidence when transaction times are far apart', () => {
    const base = domain.createDemoDataset(REFERENCE_DATE).transactions[0];
    const existing = {
      ...base,
      id: 'txn_existing_morning',
      amountMinor: 2_000,
      date: REFERENCE_DATE,
      time: '08:00:00',
      merchant: '便利店',
      description: '早餐',
      paymentChannel: 'unknown',
      fundingInstrument: undefined,
      sourceFingerprint: undefined,
    };
    const candidate = {
      ...existing,
      id: 'txn_candidate_evening',
      time: '20:00:00',
      description: '晚餐',
    };

    assert.equal(
      domain.findDuplicateCandidates(candidate, [existing]).length,
      0,
    );
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

  test('includes a runtime custom category in analytics', () => {
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
          id: 'txn_custom_category',
          categoryId: 'work_tools',
          subcategoryId: 'hosting',
          amountMinor: 8_800,
        },
      ],
      month: REFERENCE_MONTH,
      currency: 'CNY',
      categories: CUSTOM_CATEGORIES,
    });

    assert.deepEqual(
      categories.map((category) => category.categoryId),
      ['work_tools'],
    );
    assert.equal(categories[0].label, '工作工具');
    assert.equal(categories[0].netSpentMinor, 8_800);
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
