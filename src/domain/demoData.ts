import {
  addDays,
  daysInMonth,
  formatLocalDate,
  shiftMonthKey,
  toMonthKey,
} from './date';
import { createDefaultAppSettings } from './settings';
import type {
  CategoryId,
  DomainDataset,
  FundingInstrument,
  LocalDate,
  MonthKey,
  PaymentChannel,
  RecurringExpense,
  Transaction,
  TransactionDraftInput,
  TransactionKind,
  TransactionStatus,
} from './types';

interface DemoTransactionSeed {
  id: string;
  date: LocalDate;
  merchant: string;
  amountMinor: number;
  categoryId: CategoryId;
  subcategoryId?: string;
  kind?: TransactionKind;
  status?: TransactionStatus;
  paymentChannel?: PaymentChannel;
  fundingInstrument?: FundingInstrument;
  recurringExpenseId?: string;
  note?: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateInMonth(
  month: MonthKey,
  requestedDay: number,
  maximumDay?: number,
): LocalDate {
  const day = Math.max(
    1,
    Math.min(requestedDay, maximumDay ?? daysInMonth(month), daysInMonth(month)),
  );
  return `${month}-${pad2(day)}`;
}

function timestampForDate(date: LocalDate): string {
  return `${date}T12:00:00.000Z`;
}

function createDemoTransaction(seed: DemoTransactionSeed): Transaction {
  const timestamp = timestampForDate(seed.date);
  return {
    schemaVersion: 1,
    id: seed.id,
    kind: seed.kind ?? 'expense',
    status: seed.status ?? 'confirmed',
    amountMinor: seed.amountMinor,
    currency: 'CNY',
    date: seed.date,
    merchant: seed.merchant,
    categoryId: seed.categoryId,
    ...(seed.subcategoryId ? { subcategoryId: seed.subcategoryId } : {}),
    paymentChannel: seed.paymentChannel ?? 'alipay',
    ...(seed.fundingInstrument
      ? { fundingInstrument: seed.fundingInstrument }
      : {}),
    ...(seed.recurringExpenseId
      ? { recurringExpenseId: seed.recurringExpenseId }
      : {}),
    ...(seed.note ? { note: seed.note } : {}),
    tags: [],
    source: 'demo',
    sourceFingerprint: `demo:${seed.id}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(seed.status !== 'pending' &&
    seed.status !== 'failed' &&
    seed.status !== 'cancelled'
      ? { confirmedAt: timestamp }
      : {}),
  };
}

function getReferenceLocalDate(reference: Date | LocalDate): LocalDate {
  return typeof reference === 'string'
    ? reference
    : formatLocalDate(reference);
}

export function createDemoTransactions(
  reference: Date | LocalDate = new Date(),
): Transaction[] {
  const referenceDate = getReferenceLocalDate(reference);
  const anchorMonth = toMonthKey(referenceDate);
  const anchorDay = Number(referenceDate.slice(8, 10));
  const transactions: Transaction[] = [];

  for (let offset = -5; offset <= 0; offset += 1) {
    const month = shiftMonthKey(anchorMonth, offset);
    const suffix = month.replace('-', '');
    const maximumDay = offset === 0 ? anchorDay : undefined;
    const variation = (offset + 5) * 350;
    const sharedFunding: FundingInstrument = {
      type: 'credit_card',
      issuer: '招商银行',
      label: 'Visa',
      last4: '4821',
    };
    const seeds: DemoTransactionSeed[] = [
      {
        id: `demo_${suffix}_rent`,
        date: dateInMonth(month, 1, maximumDay),
        merchant: '房租',
        amountMinor: 250_000,
        categoryId: 'housing',
        subcategoryId: 'rent',
        paymentChannel: 'bank_app',
        fundingInstrument: {
          type: 'debit_card',
          issuer: '招商银行',
          last4: '1608',
        },
        recurringExpenseId: 'demo_rec_rent',
      },
      {
        id: `demo_${suffix}_cursor`,
        date: dateInMonth(month, 3, maximumDay),
        merchant: 'Cursor',
        amountMinor: 14_000,
        categoryId: 'digital',
        subcategoryId: 'ai_services',
        paymentChannel: 'merchant_direct',
        fundingInstrument: sharedFunding,
        recurringExpenseId: 'demo_rec_cursor',
      },
      {
        id: `demo_${suffix}_breakfast`,
        date: dateInMonth(month, 7, maximumDay),
        merchant: '早餐店',
        amountMinor: 2_800 + variation,
        categoryId: 'food',
        subcategoryId: 'dining',
        paymentChannel: 'wechat_pay',
      },
      {
        id: `demo_${suffix}_delivery`,
        date: dateInMonth(month, 12, maximumDay),
        merchant: '外卖',
        amountMinor: 6_500 + Math.round(variation / 2),
        categoryId: 'food',
        subcategoryId: 'delivery',
      },
      {
        id: `demo_${suffix}_metro`,
        date: dateInMonth(month, 15, maximumDay),
        merchant: '地铁',
        amountMinor: 3_200,
        categoryId: 'transport',
        subcategoryId: 'public_transport',
        paymentChannel: 'wechat_pay',
      },
      {
        id: `demo_${suffix}_daily`,
        date: dateInMonth(month, 20, maximumDay),
        merchant: '日用品',
        amountMinor: 15_900 - Math.round(variation / 3),
        categoryId: 'daily',
        subcategoryId: 'household',
        fundingInstrument: sharedFunding,
      },
      {
        id: `demo_${suffix}_movie`,
        date: dateInMonth(month, 23, maximumDay),
        merchant: '电影院',
        amountMinor: 9_900 + variation,
        categoryId: 'leisure',
        subcategoryId: 'movies',
        paymentChannel: 'wechat_pay',
      },
    ];

    transactions.push(...seeds.map(createDemoTransaction));
  }

  const currentDate = (day: number) =>
    dateInMonth(anchorMonth, day, anchorDay);
  transactions.push(
    createDemoTransaction({
      id: `demo_${anchorMonth.replace('-', '')}_refund`,
      date: currentDate(18),
      merchant: '日用品退款',
      amountMinor: 2_900,
      categoryId: 'daily',
      subcategoryId: 'household',
      kind: 'refund',
    }),
    createDemoTransaction({
      id: `demo_${anchorMonth.replace('-', '')}_pending`,
      date: currentDate(24),
      merchant: '云服务待处理',
      amountMinor: 19_900,
      categoryId: 'digital',
      subcategoryId: 'cloud_services',
      status: 'pending',
      fundingInstrument: {
        type: 'credit_card',
        issuer: '招商银行',
        last4: '4821',
      },
    }),
    createDemoTransaction({
      id: `demo_${anchorMonth.replace('-', '')}_transfer`,
      date: currentDate(10),
      merchant: '转到自己的银行卡',
      amountMinor: 200_000,
      categoryId: 'other',
      kind: 'transfer',
      paymentChannel: 'alipay',
    }),
    createDemoTransaction({
      id: `demo_${anchorMonth.replace('-', '')}_repayment`,
      date: currentDate(22),
      merchant: '信用卡还款',
      amountMinor: 350_000,
      categoryId: 'other',
      kind: 'repayment',
      paymentChannel: 'bank_app',
    }),
    createDemoTransaction({
      id: `demo_${anchorMonth.replace('-', '')}_investment`,
      date: currentDate(25),
      merchant: '指数基金定投',
      amountMinor: 100_000,
      categoryId: 'other',
      kind: 'investment',
      paymentChannel: 'bank_app',
    }),
  );

  return transactions.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || right.id.localeCompare(left.id),
  );
}

export function createDemoRecurringExpenses(
  reference: Date | LocalDate = new Date(),
): RecurringExpense[] {
  const referenceDate = getReferenceLocalDate(reference);
  const anchorMonth = toMonthKey(referenceDate);
  const referenceDay = Number(referenceDate.slice(8, 10));
  const nextDay = Math.min(referenceDay + 1, daysInMonth(anchorMonth));
  const createdAt = timestampForDate(referenceDate);

  return [
    {
      schemaVersion: 1,
      id: 'demo_rec_rent',
      name: '房租',
      merchant: '房租',
      amountMinor: 250_000,
      currency: 'CNY',
      categoryId: 'housing',
      subcategoryId: 'rent',
      cadence: 'monthly',
      interval: 1,
      startDate: '2024-01-01',
      active: true,
      paymentChannel: 'bank_app',
      fundingInstrument: {
        type: 'debit_card',
        issuer: '招商银行',
        last4: '1608',
      },
      createdAt,
      updatedAt: createdAt,
    },
    {
      schemaVersion: 1,
      id: 'demo_rec_cursor',
      name: 'Cursor',
      merchant: 'Cursor',
      amountMinor: 14_000,
      currency: 'CNY',
      categoryId: 'digital',
      subcategoryId: 'ai_services',
      cadence: 'monthly',
      interval: 1,
      startDate: '2024-01-03',
      active: true,
      paymentChannel: 'merchant_direct',
      fundingInstrument: {
        type: 'credit_card',
        issuer: '招商银行',
        label: 'Visa',
        last4: '4821',
      },
      createdAt,
      updatedAt: createdAt,
    },
    {
      schemaVersion: 1,
      id: 'demo_rec_domain',
      name: '域名续费',
      merchant: '域名服务',
      amountMinor: 7_800,
      currency: 'CNY',
      categoryId: 'digital',
      subcategoryId: 'cloud_services',
      cadence: 'yearly',
      interval: 1,
      startDate: dateInMonth(anchorMonth, nextDay),
      active: true,
      paymentChannel: 'merchant_direct',
      fundingInstrument: {
        type: 'credit_card',
        issuer: '招商银行',
        last4: '4821',
      },
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

export function createDemoDraft(
  reference: Date | LocalDate = new Date(),
): TransactionDraftInput {
  const date = getReferenceLocalDate(reference);
  return {
    kind: 'expense',
    status: 'confirmed',
    amountMinor: 3_680,
    currency: 'CNY',
    date,
    merchant: '示例咖啡店',
    description: '冰拿铁',
    categoryId: 'food',
    subcategoryId: 'snacks_drinks',
    paymentChannel: 'wechat_pay',
    fundingInstrument: {
      type: 'debit_card',
      issuer: '招商银行',
      last4: '1608',
    },
    source: 'combined',
    evidence: {
      amountMinor: {
        source: 'image',
        confidence: 0.99,
        evidence: '实付 ¥36.80',
      },
      merchant: {
        source: 'image',
        confidence: 0.96,
        evidence: '示例咖啡店',
      },
      categoryId: {
        source: 'text',
        confidence: 0.9,
        evidence: '咖啡',
      },
    },
  };
}

export function createDemoDataset(
  reference: Date | LocalDate = new Date(),
): DomainDataset {
  return {
    settings: createDefaultAppSettings({
      monthlyBudgetMinor: 600_000,
      reserveRecurringExpenses: true,
      categoryBudgetsMinor: {
        food: 150_000,
        digital: 80_000,
        transport: 50_000,
        daily: 70_000,
        housing: 260_000,
      },
    }),
    transactions: createDemoTransactions(reference),
    recurringExpenses: createDemoRecurringExpenses(reference),
  };
}

export function createDemoTomorrow(
  reference: Date | LocalDate = new Date(),
): LocalDate {
  return addDays(getReferenceLocalDate(reference), 1);
}
