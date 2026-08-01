import type { CurrencyCode } from './types';

const CURRENCY_MINOR_UNITS: Record<string, number> = {
  BHD: 3,
  CLP: 0,
  CNY: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  MOP: 2,
  TWD: 2,
  USD: 2,
};

export function normalizeCurrencyCode(
  value: unknown,
  fallback?: CurrencyCode,
): CurrencyCode | null {
  if (typeof value !== 'string') {
    return fallback ? fallback.toUpperCase() : null;
  }

  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return fallback ? fallback.toUpperCase() : null;
  }

  return normalized;
}

export function getCurrencyMinorUnits(currency: CurrencyCode): number {
  return CURRENCY_MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

export function majorToMinor(
  amountMajor: number,
  currency: CurrencyCode,
): number | null {
  if (!Number.isFinite(amountMajor)) {
    return null;
  }

  const factor = 10 ** getCurrencyMinorUnits(currency);
  const sign = amountMajor < 0 ? -1 : 1;
  const amountMinor = sign * Math.round(Math.abs(amountMajor) * factor);

  return Number.isSafeInteger(amountMinor) ? amountMinor : null;
}

export function minorToMajor(
  amountMinor: number,
  currency: CurrencyCode,
): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error('Minor amount must be a safe integer');
  }

  return amountMinor / 10 ** getCurrencyMinorUnits(currency);
}

export function parseMoneyToMinor(
  value: unknown,
  currency: CurrencyCode,
): number | null {
  if (typeof value === 'number') {
    return majorToMinor(value, currency);
  }

  if (typeof value !== 'string') {
    return null;
  }

  let normalized = value
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/[,\s，]/g, '')
    .replace(/人民币|CNY|RMB|元/gi, '')
    .replace(/[¥￥$€£]/g, '');

  if (!normalized) {
    return null;
  }

  let negative = false;
  if (/^\(.*\)$/.test(normalized)) {
    negative = true;
    normalized = normalized.slice(1, -1);
  }
  if (normalized.startsWith('-')) {
    negative = true;
    normalized = normalized.slice(1);
  } else if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  }

  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    return null;
  }

  const amountMajor = Number(normalized);
  return majorToMinor(negative ? -amountMajor : amountMajor, currency);
}

export function normalizeMinorAmount(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return Math.abs(parsed);
}

export function formatMoneyMinor(
  amountMinor: number,
  currency: CurrencyCode,
  locale = 'zh-CN',
  options: { showCurrency?: boolean; sign?: boolean } = {},
): string {
  const amountMajor = minorToMajor(amountMinor, currency);
  const showCurrency = options.showCurrency ?? true;
  const signDisplay = options.sign ? 'exceptZero' : 'auto';

  try {
    return new Intl.NumberFormat(locale, {
      style: showCurrency ? 'currency' : 'decimal',
      currency: showCurrency ? currency : undefined,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: getCurrencyMinorUnits(currency),
      maximumFractionDigits: getCurrencyMinorUnits(currency),
      signDisplay,
    }).format(amountMajor);
  } catch {
    const fractionDigits = getCurrencyMinorUnits(currency);
    const fallback = amountMajor.toFixed(fractionDigits);
    return showCurrency ? `${currency} ${fallback}` : fallback;
  }
}
