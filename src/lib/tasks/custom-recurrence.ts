const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Converts a date-only value without allowing the browser timezone to shift it. */
export function dateKeyToLocalDate(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function localDateToDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Normalizes, validates, sorts and de-duplicates explicit recurrence dates. */
export function normalizeCustomRecurrenceDates(values: string[]): string[] {
  return Array.from(
    new Set(values.filter((value) => dateKeyToLocalDate(value) !== null)),
  ).sort();
}

export function customRecurrenceDateRange(values: string[]): { startDate: string; endDate: string } {
  const dates = normalizeCustomRecurrenceDates(values);
  return {
    startDate: dates[0] ?? "",
    endDate: dates[dates.length - 1] ?? "",
  };
}
