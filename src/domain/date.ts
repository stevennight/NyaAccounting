import type { LocalDate, LocalTime, MonthKey } from './types';

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function buildLocalDate(year: number, month: number, day: number): LocalDate {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseLocalDateParts(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isLocalDate(value: unknown): value is LocalDate {
  return (
    typeof value === 'string' && parseLocalDateParts(value) !== null
  );
}

export function normalizeLocalDate(value: unknown): LocalDate | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return formatLocalDate(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(
    trimmed,
  );
  const separatedMatch =
    /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:$|[T\s])/.exec(trimmed);
  const chineseMatch =
    /^(\d{4})年(\d{1,2})月(\d{1,2})日?/.exec(trimmed);
  const match = directMatch ?? separatedMatch ?? chineseMatch;

  if (!match) {
    return null;
  }

  const normalized = buildLocalDate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );

  return parseLocalDateParts(normalized) ? normalized : null;
}

export function formatLocalDate(date: Date): LocalDate {
  return buildLocalDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
}

function buildLocalTime(
  hour: number,
  minute: number,
  second: number,
): LocalTime {
  return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === 'string' && LOCAL_TIME_PATTERN.test(value);
}

export function normalizeLocalTime(value: unknown): LocalTime | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return formatLocalTime(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match =
    /(?:^|[T\s日])([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?=$|[.\sZ+-])/i.exec(
      trimmed,
    );
  if (!match) {
    return null;
  }

  const normalized = buildLocalTime(
    Number(match[1]),
    Number(match[2]),
    Number(match[3] ?? 0),
  );
  return isLocalTime(normalized) ? normalized : null;
}

export function formatLocalTime(date: Date): LocalTime {
  return buildLocalTime(
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
}

export function isMonthKey(value: unknown): value is MonthKey {
  if (typeof value !== 'string') {
    return false;
  }

  const match = MONTH_KEY_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function toMonthKey(date: LocalDate): MonthKey {
  if (!isLocalDate(date)) {
    throw new Error(`Invalid local date: ${date}`);
  }

  return date.slice(0, 7);
}

export function formatMonthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function daysInMonth(month: MonthKey): number {
  if (!isMonthKey(month)) {
    throw new Error(`Invalid month key: ${month}`);
  }

  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function getMonthBounds(month: MonthKey): {
  start: LocalDate;
  end: LocalDate;
} {
  if (!isMonthKey(month)) {
    throw new Error(`Invalid month key: ${month}`);
  }

  return {
    start: `${month}-01`,
    end: `${month}-${pad2(daysInMonth(month))}`,
  };
}

export function compareLocalDates(
  left: LocalDate,
  right: LocalDate,
): number {
  if (!isLocalDate(left) || !isLocalDate(right)) {
    throw new Error('compareLocalDates requires valid local dates');
  }

  return left.localeCompare(right);
}

export function addDays(date: LocalDate, amount: number): LocalDate {
  const parts = parseLocalDateParts(date);
  if (!parts || !Number.isInteger(amount)) {
    throw new Error('addDays requires a valid date and integer amount');
  }

  const next = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + amount),
  );
  return buildLocalDate(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

export function addMonths(date: LocalDate, amount: number): LocalDate {
  const parts = parseLocalDateParts(date);
  if (!parts || !Number.isInteger(amount)) {
    throw new Error('addMonths requires a valid date and integer amount');
  }

  const monthIndex = parts.year * 12 + (parts.month - 1) + amount;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const targetMonth = `${targetYear}-${pad2(targetMonthIndex + 1)}`;
  const targetDay = Math.min(parts.day, daysInMonth(targetMonth));

  return buildLocalDate(targetYear, targetMonthIndex + 1, targetDay);
}

export function addYears(date: LocalDate, amount: number): LocalDate {
  const parts = parseLocalDateParts(date);
  if (!parts || !Number.isInteger(amount)) {
    throw new Error('addYears requires a valid date and integer amount');
  }

  const targetYear = parts.year + amount;
  const targetMonth = `${targetYear}-${pad2(parts.month)}`;
  const targetDay = Math.min(parts.day, daysInMonth(targetMonth));

  return buildLocalDate(targetYear, parts.month, targetDay);
}

export function daysBetween(
  earlier: LocalDate,
  later: LocalDate,
): number {
  const earlierParts = parseLocalDateParts(earlier);
  const laterParts = parseLocalDateParts(later);
  if (!earlierParts || !laterParts) {
    throw new Error('daysBetween requires valid local dates');
  }

  const earlierMs = Date.UTC(
    earlierParts.year,
    earlierParts.month - 1,
    earlierParts.day,
  );
  const laterMs = Date.UTC(
    laterParts.year,
    laterParts.month - 1,
    laterParts.day,
  );

  return Math.round((laterMs - earlierMs) / 86_400_000);
}

export function shiftMonthKey(month: MonthKey, amount: number): MonthKey {
  if (!isMonthKey(month) || !Number.isInteger(amount)) {
    throw new Error('shiftMonthKey requires a valid month and integer amount');
  }

  return toMonthKey(addMonths(`${month}-01`, amount));
}

export function trailingMonthKeys(
  anchorMonth: MonthKey,
  count = 6,
): MonthKey[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('Month count must be a non-negative integer');
  }

  return Array.from({ length: count }, (_, index) =>
    shiftMonthKey(anchorMonth, index - count + 1),
  );
}
