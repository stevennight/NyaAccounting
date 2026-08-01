import AsyncStorage from '@react-native-async-storage/async-storage';

import { isLocalTime } from '../domain/date';
import {
  AppSettings,
  DomainDataset,
  RecurringExpense,
  Transaction,
} from '../domain/types';

const DATASET_KEY = '@nya-accounting/dataset/v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeTransaction(value: unknown): value is Transaction {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.schemaVersion === 1 &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.amountMinor === 'number' &&
    Number.isInteger(value.amountMinor) &&
    typeof value.currency === 'string' &&
    typeof value.date === 'string' &&
    (value.time === undefined || isLocalTime(value.time)) &&
    typeof value.merchant === 'string'
  );
}

function looksLikeRecurringExpense(value: unknown): value is RecurringExpense {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.schemaVersion === 1 &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.amountMinor === 'number' &&
    Number.isInteger(value.amountMinor)
  );
}

function looksLikeSettings(value: unknown): value is AppSettings {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.schemaVersion === 1 &&
    typeof value.currency === 'string' &&
    typeof value.locale === 'string' &&
    typeof value.monthlyBudgetMinor === 'number' &&
    isRecord(value.ai)
  );
}

export function parseDatasetJson(raw: string): DomainDataset {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error('备份文件不是有效的账本数据。');
  }

  if (!looksLikeSettings(parsed.settings)) {
    throw new Error('备份文件缺少有效的设置。');
  }

  if (!Array.isArray(parsed.transactions) || !parsed.transactions.every(looksLikeTransaction)) {
    throw new Error('备份文件包含无法识别的账目。');
  }

  if (
    !Array.isArray(parsed.recurringExpenses) ||
    !parsed.recurringExpenses.every(looksLikeRecurringExpense)
  ) {
    throw new Error('备份文件包含无法识别的订阅项目。');
  }

  return {
    settings: parsed.settings,
    transactions: parsed.transactions,
    recurringExpenses: parsed.recurringExpenses,
  };
}

export async function loadDataset(): Promise<DomainDataset | null> {
  const raw = await AsyncStorage.getItem(DATASET_KEY);
  return raw ? parseDatasetJson(raw) : null;
}

export async function saveDataset(dataset: DomainDataset): Promise<void> {
  await AsyncStorage.setItem(DATASET_KEY, JSON.stringify(dataset));
}

export async function deleteDataset(): Promise<void> {
  await AsyncStorage.removeItem(DATASET_KEY);
}

export function serializeDataset(dataset: DomainDataset): string {
  return JSON.stringify(dataset, null, 2);
}

