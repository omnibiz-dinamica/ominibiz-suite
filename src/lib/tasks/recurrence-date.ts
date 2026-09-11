const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Date-only recurrence boundaries are inclusive and never pass through UTC. */
export function isDateKeyWithinInclusiveRange(dateKey: string, startDate: string, endDate?: string | null): boolean {
  if (!DATE_KEY.test(dateKey) || !DATE_KEY.test(startDate)) return false;
  return dateKey >= startDate && (!endDate || (DATE_KEY.test(endDate) && dateKey <= endDate));
}
