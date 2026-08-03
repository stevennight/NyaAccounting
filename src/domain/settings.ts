import {
  AI_REASONING_EFFORTS,
  type AiSettings,
  type AppSettings,
  type CategoryDefinition,
  type CategoryId,
  type PaymentChannelDefinition,
  type PaymentChannel,
} from './types';
import {
  CATEGORY_DEFINITIONS,
  cloneCategoryDefinitions,
  isCategoryId,
  normalizeCategoryDefinitions,
} from './categories';
import { DEFAULT_PAYMENT_CHANNEL_DEFINITIONS } from './paymentChannels';
import { normalizeCurrencyCode } from './money';

export const DEFAULT_AI_SETTINGS: Readonly<AiSettings> = {
  enabled: false,
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  transcriptionModel: 'gpt-4o-mini-transcribe',
  reasoningEffort: 'auto',
  requestTimeoutMs: 45_000,
  sendImages: true,
};

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  schemaVersion: 1,
  currency: 'CNY',
  locale: 'zh-CN',
  monthlyBudgetMinor: 0,
  categories: cloneCategoryDefinitions(),
  categoryBudgetsMinor: {},
  reserveRecurringExpenses: false,
  budgetWarningRatio: 0.8,
  budgetDangerRatio: 0.95,
  defaultCategoryId: 'other',
  defaultPaymentChannel: 'unknown',
  paymentChannels: DEFAULT_PAYMENT_CHANNEL_DEFINITIONS.map((item) => ({ ...item })),
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
  categories: readonly CategoryDefinition[],
): Partial<Record<CategoryId, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [CategoryId, number] =>
          isCategoryId(entry[0], categories) &&
          typeof entry[1] === 'number' &&
          Number.isSafeInteger(entry[1]) &&
          entry[1] >= 0,
      )
      .map(([categoryId, amountMinor]) => [categoryId, amountMinor]),
  );
}

function fallbackCategoryId(
  categories: readonly CategoryDefinition[],
): CategoryId {
  return (
    categories.find((category) => category.id === 'other')?.id ??
    categories[0]?.id ??
    'other'
  );
}

function normalizePaymentChannels(value: unknown): PaymentChannelDefinition[] {
  const raw = Array.isArray(value) ? value : DEFAULT_PAYMENT_CHANNEL_DEFINITIONS;
  const seen = new Set<string>();
  const normalized: PaymentChannelDefinition[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    if (!id || !label || id.length > 100 || label.length > 100 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({ id, label });
  }

  for (const builtin of DEFAULT_PAYMENT_CHANNEL_DEFINITIONS) {
    if (!seen.has(builtin.id)) {
      normalized.push({ ...builtin });
    }
  }

  return normalized;
}

export function createDefaultAppSettings(
  patch: AppSettingsPatch = {},
): AppSettings {
  const categories = normalizeCategoryDefinitions(
    patch.categories,
    CATEGORY_DEFINITIONS,
  );
  const defaultCategoryId = isCategoryId(
    patch.defaultCategoryId,
    categories,
  )
    ? patch.defaultCategoryId
    : fallbackCategoryId(categories);

  return {
    ...DEFAULT_APP_SETTINGS,
    ...patch,
    schemaVersion: 1,
    categories,
    categoryBudgetsMinor: normalizeCategoryBudgets(
      patch.categoryBudgetsMinor,
      categories,
    ),
    paymentChannels: normalizePaymentChannels(patch.paymentChannels),
    defaultCategoryId,
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
  const categories = normalizeCategoryDefinitions(record.categories);
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
  const paymentChannels = normalizePaymentChannels(record.paymentChannels);
  const defaultPaymentChannel =
    typeof record.defaultPaymentChannel === 'string' &&
    paymentChannels.some((item) => item.id === record.defaultPaymentChannel)
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
    categories,
    categoryBudgetsMinor: normalizeCategoryBudgets(
      record.categoryBudgetsMinor,
      categories,
    ),
    reserveRecurringExpenses:
      typeof record.reserveRecurringExpenses === 'boolean'
        ? record.reserveRecurringExpenses
        : DEFAULT_APP_SETTINGS.reserveRecurringExpenses,
    budgetWarningRatio: warningRatio,
    budgetDangerRatio: dangerRatio,
    defaultCategoryId: isCategoryId(record.defaultCategoryId, categories)
      ? record.defaultCategoryId
      : fallbackCategoryId(categories),
    defaultPaymentChannel,
    paymentChannels,
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
      reasoningEffort:
        typeof rawAi.reasoningEffort === 'string' &&
        (AI_REASONING_EFFORTS as readonly string[]).includes(
          rawAi.reasoningEffort,
        )
          ? (rawAi.reasoningEffort as AiSettings['reasoningEffort'])
          : DEFAULT_AI_SETTINGS.reasoningEffort,
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
