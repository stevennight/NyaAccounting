import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Platform } from 'react-native';

import { isLocalDate, isLocalTime } from '../domain/date';
import {
  CATEGORY_IDS,
  FUNDING_INSTRUMENT_TYPES,
  PAYMENT_CHANNELS,
  RECURRENCE_CADENCES,
  TRANSACTION_KINDS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
} from '../domain/types';
import type {
  AppSettings,
  DomainDataset,
  FundingInstrument,
  RecurringExpense,
  Transaction,
} from '../domain/types';

export const DATASET_BACKUP_FORMAT = 'nya-accounting-backup';
export const DATASET_BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const MAX_TRANSACTIONS = 100_000;
const MAX_RECURRING_EXPENSES = 10_000;

const categoryIds = new Set<string>(CATEGORY_IDS);
const fundingInstrumentTypes = new Set<string>(FUNDING_INSTRUMENT_TYPES);
const paymentChannels = new Set<string>(PAYMENT_CHANNELS);
const recurrenceCadences = new Set<string>(RECURRENCE_CADENCES);
const transactionKinds = new Set<string>(TRANSACTION_KINDS);
const transactionSources = new Set<string>(TRANSACTION_SOURCES);
const transactionStatuses = new Set<string>(TRANSACTION_STATUSES);

type BackupEnvelopeV1 = {
  format: typeof DATASET_BACKUP_FORMAT;
  backupVersion: typeof DATASET_BACKUP_VERSION;
  exportedAt: string;
  dataset: DomainDataset;
};

export type ParsedDatasetBackup = {
  dataset: DomainDataset;
  exportedAt: string | null;
  backupVersion: number;
  legacy: boolean;
};

export type PickedDatasetBackup = ParsedDatasetBackup & {
  fileName: string;
  fileSizeBytes: number | null;
};

export type DatasetExportResult = {
  fileName: string;
  method: 'download' | 'share';
};

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

function validationError(path: string, message: string): never {
  throw new BackupValidationError(`${path}：${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    validationError(path, '应为对象。');
  }
  return value;
}

function expectString(
  value: unknown,
  path: string,
  options: { allowEmpty?: boolean; maximumLength?: number } = {},
): string {
  if (typeof value !== 'string') {
    validationError(path, '应为文本。');
  }
  const maximumLength = options.maximumLength ?? 2_000;
  if (!options.allowEmpty && !value.trim()) {
    validationError(path, '不能为空。');
  }
  if (value.length > maximumLength) {
    validationError(path, `文本过长，最多允许 ${maximumLength} 个字符。`);
  }
  return value;
}

function expectOptionalString(
  value: unknown,
  path: string,
  maximumLength = 2_000,
): void {
  if (value !== undefined) {
    expectString(value, path, { maximumLength });
  }
}

function expectBoolean(value: unknown, path: string): void {
  if (typeof value !== 'boolean') {
    validationError(path, '应为布尔值。');
  }
}

function expectSafeInteger(
  value: unknown,
  path: string,
  options: { minimum?: number; maximum?: number } = {},
): void {
  if (!Number.isSafeInteger(value)) {
    validationError(path, '应为安全整数。');
  }
  const numeric = value as number;
  if (options.minimum !== undefined && numeric < options.minimum) {
    validationError(path, `不能小于 ${options.minimum}。`);
  }
  if (options.maximum !== undefined && numeric > options.maximum) {
    validationError(path, `不能大于 ${options.maximum}。`);
  }
}

function expectRatio(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    validationError(path, '应为 0 到 1 之间的数字。');
  }
  return value;
}

function expectEnum(value: unknown, allowed: ReadonlySet<string>, path: string): void {
  if (typeof value !== 'string' || !allowed.has(value)) {
    validationError(path, '包含不支持的值。');
  }
}

function expectLocalDate(value: unknown, path: string): void {
  if (!isLocalDate(value)) {
    validationError(path, '应为有效的 YYYY-MM-DD 日期。');
  }
}

function expectTimestamp(value: unknown, path: string): void {
  if (
    typeof value !== 'string' ||
    !value.includes('T') ||
    !Number.isFinite(Date.parse(value))
  ) {
    validationError(path, '应为有效的 ISO 时间。');
  }
}

function validateFundingInstrument(value: unknown, path: string): void {
  const instrument = expectRecord(value, path);
  expectEnum(instrument.type, fundingInstrumentTypes, `${path}.type`);
  expectOptionalString(instrument.issuer, `${path}.issuer`, 200);
  expectOptionalString(instrument.label, `${path}.label`, 200);
  expectOptionalString(instrument.last4, `${path}.last4`, 32);
}

function validateStringArray(
  value: unknown,
  path: string,
  maximumItems: number,
  maximumItemLength: number,
): void {
  if (!Array.isArray(value)) {
    validationError(path, '应为数组。');
  }
  if (value.length > maximumItems) {
    validationError(path, `项目过多，最多允许 ${maximumItems} 项。`);
  }
  value.forEach((item, index) => {
    expectString(item, `${path}[${index}]`, {
      allowEmpty: true,
      maximumLength: maximumItemLength,
    });
  });
}

function validateTransaction(value: unknown, index: number): Transaction {
  const path = `dataset.transactions[${index}]`;
  const transaction = expectRecord(value, path);

  if (transaction.schemaVersion !== 1) {
    validationError(`${path}.schemaVersion`, '仅支持版本 1。');
  }
  expectString(transaction.id, `${path}.id`, { maximumLength: 200 });
  expectEnum(transaction.kind, transactionKinds, `${path}.kind`);
  expectEnum(transaction.status, transactionStatuses, `${path}.status`);
  expectSafeInteger(transaction.amountMinor, `${path}.amountMinor`, { minimum: 1 });
  expectString(transaction.currency, `${path}.currency`, { maximumLength: 16 });
  expectLocalDate(transaction.date, `${path}.date`);
  if (transaction.time !== undefined && !isLocalTime(transaction.time)) {
    validationError(`${path}.time`, '应为有效的 HH:mm:ss 时间。');
  }
  expectString(transaction.merchant, `${path}.merchant`, { maximumLength: 500 });
  expectOptionalString(transaction.description, `${path}.description`);
  expectEnum(transaction.categoryId, categoryIds, `${path}.categoryId`);
  expectOptionalString(transaction.subcategoryId, `${path}.subcategoryId`, 200);
  expectEnum(transaction.paymentChannel, paymentChannels, `${path}.paymentChannel`);
  if (transaction.fundingInstrument !== undefined) {
    validateFundingInstrument(
      transaction.fundingInstrument,
      `${path}.fundingInstrument`,
    );
  }
  expectOptionalString(transaction.recurringExpenseId, `${path}.recurringExpenseId`, 200);
  expectOptionalString(transaction.note, `${path}.note`, 10_000);
  validateStringArray(transaction.tags, `${path}.tags`, 100, 200);
  expectEnum(transaction.source, transactionSources, `${path}.source`);
  expectOptionalString(transaction.sourceFingerprint, `${path}.sourceFingerprint`, 1_000);
  expectTimestamp(transaction.createdAt, `${path}.createdAt`);
  expectTimestamp(transaction.updatedAt, `${path}.updatedAt`);
  if (transaction.confirmedAt !== undefined) {
    expectTimestamp(transaction.confirmedAt, `${path}.confirmedAt`);
  }

  return transaction as unknown as Transaction;
}

function validateRecurringExpense(
  value: unknown,
  index: number,
): RecurringExpense {
  const path = `dataset.recurringExpenses[${index}]`;
  const expense = expectRecord(value, path);

  if (expense.schemaVersion !== 1) {
    validationError(`${path}.schemaVersion`, '仅支持版本 1。');
  }
  expectString(expense.id, `${path}.id`, { maximumLength: 200 });
  expectString(expense.name, `${path}.name`, { maximumLength: 500 });
  expectOptionalString(expense.merchant, `${path}.merchant`, 500);
  expectSafeInteger(expense.amountMinor, `${path}.amountMinor`, { minimum: 1 });
  expectString(expense.currency, `${path}.currency`, { maximumLength: 16 });
  expectEnum(expense.categoryId, categoryIds, `${path}.categoryId`);
  expectOptionalString(expense.subcategoryId, `${path}.subcategoryId`, 200);
  expectEnum(expense.cadence, recurrenceCadences, `${path}.cadence`);
  expectSafeInteger(expense.interval, `${path}.interval`, {
    minimum: 1,
    maximum: 10_000,
  });
  expectLocalDate(expense.startDate, `${path}.startDate`);
  if (expense.endDate !== undefined) {
    expectLocalDate(expense.endDate, `${path}.endDate`);
    if (
      typeof expense.startDate === 'string' &&
      typeof expense.endDate === 'string' &&
      expense.endDate < expense.startDate
    ) {
      validationError(`${path}.endDate`, '不能早于开始日期。');
    }
  }
  expectBoolean(expense.active, `${path}.active`);
  expectEnum(expense.paymentChannel, paymentChannels, `${path}.paymentChannel`);
  if (expense.fundingInstrument !== undefined) {
    validateFundingInstrument(expense.fundingInstrument, `${path}.fundingInstrument`);
  }
  expectOptionalString(expense.note, `${path}.note`, 10_000);
  expectTimestamp(expense.createdAt, `${path}.createdAt`);
  expectTimestamp(expense.updatedAt, `${path}.updatedAt`);

  return expense as unknown as RecurringExpense;
}

function validateSettings(value: unknown): AppSettings {
  const path = 'dataset.settings';
  const settings = expectRecord(value, path);

  if (settings.schemaVersion !== 1) {
    validationError(`${path}.schemaVersion`, '仅支持版本 1。');
  }
  expectString(settings.currency, `${path}.currency`, { maximumLength: 16 });
  expectString(settings.locale, `${path}.locale`, { maximumLength: 100 });
  expectSafeInteger(settings.monthlyBudgetMinor, `${path}.monthlyBudgetMinor`, {
    minimum: 0,
  });

  const categoryBudgets = expectRecord(
    settings.categoryBudgetsMinor,
    `${path}.categoryBudgetsMinor`,
  );
  for (const [categoryId, amountMinor] of Object.entries(categoryBudgets)) {
    if (!categoryIds.has(categoryId)) {
      validationError(
        `${path}.categoryBudgetsMinor.${categoryId}`,
        '分类不存在。',
      );
    }
    expectSafeInteger(
      amountMinor,
      `${path}.categoryBudgetsMinor.${categoryId}`,
      { minimum: 0 },
    );
  }

  expectBoolean(
    settings.reserveRecurringExpenses,
    `${path}.reserveRecurringExpenses`,
  );
  const warningRatio = expectRatio(
    settings.budgetWarningRatio,
    `${path}.budgetWarningRatio`,
  );
  const dangerRatio = expectRatio(
    settings.budgetDangerRatio,
    `${path}.budgetDangerRatio`,
  );
  if (warningRatio > dangerRatio) {
    validationError(
      `${path}.budgetDangerRatio`,
      '不能低于预算提醒比例。',
    );
  }
  expectEnum(settings.defaultCategoryId, categoryIds, `${path}.defaultCategoryId`);
  expectEnum(
    settings.defaultPaymentChannel,
    paymentChannels,
    `${path}.defaultPaymentChannel`,
  );
  if (settings.defaultFundingInstrument !== undefined) {
    validateFundingInstrument(
      settings.defaultFundingInstrument,
      `${path}.defaultFundingInstrument`,
    );
  }
  if (settings.firstDayOfWeek !== 0 && settings.firstDayOfWeek !== 1) {
    validationError(`${path}.firstDayOfWeek`, '仅支持 0 或 1。');
  }
  if (
    settings.theme !== 'system' &&
    settings.theme !== 'light' &&
    settings.theme !== 'dark'
  ) {
    validationError(`${path}.theme`, '主题值无效。');
  }
  expectBoolean(
    settings.deleteRawSourcesAfterConfirmation,
    `${path}.deleteRawSourcesAfterConfirmation`,
  );

  const ai = expectRecord(settings.ai, `${path}.ai`);
  expectBoolean(ai.enabled, `${path}.ai.enabled`);
  expectString(ai.endpoint, `${path}.ai.endpoint`, {
    allowEmpty: true,
    maximumLength: 2_048,
  });
  expectString(ai.model, `${path}.ai.model`, {
    allowEmpty: true,
    maximumLength: 500,
  });
  if (ai.transcriptionModel !== undefined) {
    expectString(ai.transcriptionModel, `${path}.ai.transcriptionModel`, {
      allowEmpty: true,
      maximumLength: 500,
    });
  }
  expectSafeInteger(ai.requestTimeoutMs, `${path}.ai.requestTimeoutMs`, {
    minimum: 1,
    maximum: 600_000,
  });
  expectBoolean(ai.sendImages, `${path}.ai.sendImages`);

  return settings as unknown as AppSettings;
}

function assertUniqueIds(
  values: readonly { id: string }[],
  path: string,
): void {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    if (ids.has(value.id)) {
      validationError(`${path}[${index}].id`, `发现重复 ID：${value.id}`);
    }
    ids.add(value.id);
  });
}

export function validateDomainDataset(value: unknown): DomainDataset {
  const dataset = expectRecord(value, 'dataset');
  const settings = validateSettings(dataset.settings);

  if (!Array.isArray(dataset.transactions)) {
    validationError('dataset.transactions', '应为数组。');
  }
  if (dataset.transactions.length > MAX_TRANSACTIONS) {
    validationError(
      'dataset.transactions',
      `账目过多，最多允许 ${MAX_TRANSACTIONS} 笔。`,
    );
  }
  const transactions = dataset.transactions.map(validateTransaction);
  assertUniqueIds(transactions, 'dataset.transactions');

  if (!Array.isArray(dataset.recurringExpenses)) {
    validationError('dataset.recurringExpenses', '应为数组。');
  }
  if (dataset.recurringExpenses.length > MAX_RECURRING_EXPENSES) {
    validationError(
      'dataset.recurringExpenses',
      `订阅项目过多，最多允许 ${MAX_RECURRING_EXPENSES} 个。`,
    );
  }
  const recurringExpenses = dataset.recurringExpenses.map(
    validateRecurringExpense,
  );
  assertUniqueIds(recurringExpenses, 'dataset.recurringExpenses');

  return {
    settings,
    transactions,
    recurringExpenses,
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new BackupValidationError('备份文件不是有效的 JSON。');
  }
}

export function parseDatasetBackupJson(raw: string): ParsedDatasetBackup {
  const content = raw.replace(/^\uFEFF/, '').trim();
  if (!content) {
    throw new BackupValidationError('备份文件是空的。');
  }
  if (content.length > MAX_BACKUP_BYTES) {
    throw new BackupValidationError('备份文件过大，最大支持 20 MB。');
  }

  const parsed = parseJson(content);
  const root = expectRecord(parsed, '备份文件');

  if (root.format === DATASET_BACKUP_FORMAT) {
    if (root.backupVersion !== DATASET_BACKUP_VERSION) {
      const version =
        typeof root.backupVersion === 'number'
          ? String(root.backupVersion)
          : '未知';
      throw new BackupValidationError(
        `不支持此备份版本（${version}），当前仅支持版本 ${DATASET_BACKUP_VERSION}。`,
      );
    }
    expectTimestamp(root.exportedAt, 'exportedAt');
    return {
      dataset: validateDomainDataset(root.dataset),
      exportedAt: root.exportedAt as string,
      backupVersion: DATASET_BACKUP_VERSION,
      legacy: false,
    };
  }

  if (
    root.format !== undefined ||
    root.backupVersion !== undefined ||
    root.dataset !== undefined
  ) {
    throw new BackupValidationError('这不是 Nya 记账支持的备份文件。');
  }

  return {
    dataset: validateDomainDataset(root),
    exportedAt: null,
    backupVersion: 0,
    legacy: true,
  };
}

function createBackupEnvelope(
  dataset: DomainDataset,
  now: Date,
): BackupEnvelopeV1 {
  return {
    format: DATASET_BACKUP_FORMAT,
    backupVersion: DATASET_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    dataset: validateDomainDataset(dataset),
  };
}

export function serializeDatasetBackup(
  dataset: DomainDataset,
  now = new Date(),
): string {
  return JSON.stringify(createBackupEnvelope(dataset, now), null, 2);
}

function backupFileName(now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `nya-accounting-backup-${timestamp}.json`;
}

function downloadOnWeb(contents: string, fileName: string): void {
  if (
    typeof document === 'undefined' ||
    !document.body ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error('当前浏览器不支持直接下载备份。');
  }

  const blob = new Blob([contents], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function exportDatasetBackup(
  dataset: DomainDataset,
): Promise<DatasetExportResult> {
  const now = new Date();
  const fileName = backupFileName(now);
  const contents = serializeDatasetBackup(dataset, now);

  try {
    if (Platform.OS === 'web') {
      downloadOnWeb(contents, fileName);
      return { fileName, method: 'download' };
    }

    const [{ File, Paths }, Sharing] = await Promise.all([
      import('expo-file-system'),
      import('expo-sharing'),
    ]);
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('当前设备没有可用的系统分享功能。');
    }

    const file = new File(Paths.cache, fileName);
    file.create({ overwrite: true });
    file.write(contents);
    await Sharing.shareAsync(file.uri, {
      dialogTitle: '导出 Nya 记账备份',
      mimeType: 'application/json',
      UTI: 'public.json',
    });
    return { fileName, method: 'share' };
  } catch (error) {
    if (error instanceof BackupValidationError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : '未知错误';
    throw new Error(`导出备份失败：${detail}`);
  }
}

async function readPickedAsset(asset: DocumentPickerAsset): Promise<string> {
  if (
    typeof asset.size === 'number' &&
    asset.size > MAX_BACKUP_BYTES
  ) {
    throw new BackupValidationError('备份文件过大，最大支持 20 MB。');
  }

  if (Platform.OS === 'web') {
    if (asset.file) {
      return asset.file.text();
    }
    const response = await fetch(asset.uri);
    if (!response.ok) {
      throw new Error(`浏览器无法读取所选文件（${response.status}）。`);
    }
    return response.text();
  }

  const { File } = await import('expo-file-system');
  const file = new File(asset.uri);
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupValidationError('备份文件过大，最大支持 20 MB。');
  }
  return file.text();
}

export async function pickDatasetBackup(): Promise<PickedDatasetBackup | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/json',
        'text/json',
        'text/plain',
        'application/octet-stream',
      ],
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
    if (result.canceled) {
      return null;
    }

    const asset = result.assets[0];
    if (!asset) {
      throw new Error('没有读取到所选文件。');
    }
    const raw = await readPickedAsset(asset);
    const parsed = parseDatasetBackupJson(raw);

    return {
      ...parsed,
      fileName: asset.name || '未命名备份.json',
      fileSizeBytes:
        typeof asset.size === 'number' ? asset.size : null,
    };
  } catch (error) {
    if (error instanceof BackupValidationError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : '未知错误';
    throw new Error(`读取备份失败：${detail}`);
  }
}
