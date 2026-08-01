import {
  PAYMENT_CHANNELS,
  type AiSettings,
  type AppSettings,
  type CategoryId,
  type PaymentChannel,
} from './types';
import { isCategoryId } from './categories';
import { normalizeCurrencyCode } from './money';

export const DEFAULT_AI_SETTINGS: Readonly<AiSettings> = {
  enabled: false,
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  transcriptionModel: 'gpt-4o-mini-transcribe',
  requestTimeoutMs: 45_000,
  sendImages: true,
};

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  schemaVersion: 1,
  currency: 'CNY',
  locale: 'zh-CN',
  monthlyBudgetMinor: 0,
  categoryBudgetsMinor: {},
  reserveRecurringExpenses: false,
  budgetWarningRatio: 0.8,
  budgetDangerRatio: 0.95,
  defaultCategoryId: 'other',
  defaultPaymentChannel: 'unknown',
  firstDayOfWeek: 1,
  theme: 'system',
  deleteRawSourcesAfterConfirmation: true,
  ai: DEFAULT_AI_SETTINGS,
};

export type AppSettingsPatch = Partial<Omit<AppSettings, 'ai'>> & {
  ai?: Partial<AiSettings>;
};

function safeNonNegativeInteger(
  value: unknown,
  fallback: number,
): number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : fallback;
}

function safeRatio(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function normalizeCategoryBudgets(
  value: unknown,
): Partial<Record<CategoryId, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [CategoryId, number] =>
          isCategoryId(entry[0]) &&
          typeof entry[1] === 'number' &&
          Number.isSafeInteger(entry[1]) &&
          entry[1] >= 0,
      )
      .map(([categoryId, amountMinor]) => [categoryId, amountMinor]),
  );
}

export function createDefaultAppSettings(
  patch: AppSettingsPatch = {},
): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...patch,
    schemaVersion: 1,
    categoryBudgetsMinor: {
      ...DEFAULT_APP_SETTINGS.categoryBudgetsMinor,
      ...patch.categoryBudgetsMinor,
    },
    ai: {
      ...DEFAULT_AI_SETTINGS,
      ...patch.ai,
    },
  };
}

export function normalizeAppSettings(input: unknown): AppSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return createDefaultAppSettings();
  }

  const record = input as Record<string, unknown>;
  const rawAi =
    record.ai && typeof record.ai === 'object' && !Array.isArray(record.ai)
      ? (record.ai as Record<string, unknown>)
      : {};
  const warningRatio = safeRatio(
    record.budgetWarningRatio,
    DEFAULT_APP_SETTINGS.budgetWarningRatio,
  );
  const dangerRatio = Math.max(
    warningRatio,
    safeRatio(
      record.budgetDangerRatio,
      DEFAULT_APP_SETTINGS.budgetDangerRatio,
    ),
  );
  const defaultPaymentChannel =
    typeof record.defaultPaymentChannel === 'string' &&
    (PAYMENT_CHANNELS as readonly string[]).includes(
      record.defaultPaymentChannel,
    )
      ? (record.defaultPaymentChannel as PaymentChannel)
      : DEFAULT_APP_SETTINGS.defaultPaymentChannel;

  return {
    schemaVersion: 1,
    currency:
      normalizeCurrencyCode(
        record.currency,
        DEFAULT_APP_SETTINGS.currency,
      ) ?? DEFAULT_APP_SETTINGS.currency,
    locale:
      typeof record.locale === 'string' && record.locale.trim()
        ? record.locale.trim()
        : DEFAULT_APP_SETTINGS.locale,
    monthlyBudgetMinor: safeNonNegativeInteger(
      record.monthlyBudgetMinor,
      DEFAULT_APP_SETTINGS.monthlyBudgetMinor,
    ),
    categoryBudgetsMinor: normalizeCategoryBudgets(
      record.categoryBudgetsMinor,
    ),
    reserveRecurringExpenses:
      typeof record.reserveRecurringExpenses === 'boolean'
        ? record.reserveRecurringExpenses
        : DEFAULT_APP_SETTINGS.reserveRecurringExpenses,
    budgetWarningRatio: warningRatio,
    budgetDangerRatio: dangerRatio,
    defaultCategoryId: isCategoryId(record.defaultCategoryId)
      ? record.defaultCategoryId
      : DEFAULT_APP_SETTINGS.defaultCategoryId,
    defaultPaymentChannel,
    firstDayOfWeek:
      record.firstDayOfWeek === 0 || record.firstDayOfWeek === 1
        ? record.firstDayOfWeek
        : DEFAULT_APP_SETTINGS.firstDayOfWeek,
    theme:
      record.theme === 'light' || record.theme === 'dark'
        ? record.theme
        : 'system',
    deleteRawSourcesAfterConfirmation:
      typeof record.deleteRawSourcesAfterConfirmation === 'boolean'
        ? record.deleteRawSourcesAfterConfirmation
        : DEFAULT_APP_SETTINGS.deleteRawSourcesAfterConfirmation,
    ai: {
      enabled:
        typeof rawAi.enabled === 'boolean'
          ? rawAi.enabled
          : DEFAULT_AI_SETTINGS.enabled,
      endpoint:
        typeof rawAi.endpoint === 'string' && rawAi.endpoint.trim()
          ? rawAi.endpoint.trim().replace(/\/+$/, '')
          : DEFAULT_AI_SETTINGS.endpoint,
      model:
        typeof rawAi.model === 'string' && rawAi.model.trim()
          ? rawAi.model.trim()
          : DEFAULT_AI_SETTINGS.model,
      transcriptionModel:
        typeof rawAi.transcriptionModel === 'string' &&
        rawAi.transcriptionModel.trim()
          ? rawAi.transcriptionModel.trim()
          : DEFAULT_AI_SETTINGS.transcriptionModel,
      requestTimeoutMs:
        typeof rawAi.requestTimeoutMs === 'number' &&
        Number.isFinite(rawAi.requestTimeoutMs)
          ? Math.max(
              5_000,
              Math.min(120_000, Math.round(rawAi.requestTimeoutMs)),
            )
          : DEFAULT_AI_SETTINGS.requestTimeoutMs,
      sendImages:
        typeof rawAi.sendImages === 'boolean'
          ? rawAi.sendImages
          : DEFAULT_AI_SETTINGS.sendImages,
    },
  };
}
