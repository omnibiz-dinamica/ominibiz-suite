export type ScheduleRule = {
  weekdays: number[];
  cycleLengthWeeks?: number | null;
  cyclePosition?: number | null;
  cycleAnchorDate?: string | null;
  /** Mensal por dia do mês (1..28). */
  monthlyDayOfMonth?: number | null;
  /** Mensal por posição: 1..4 ou -1 (última) + dia da semana. */
  monthlyPosition?: number | null;
  monthlyWeekday?: number | null;
};


function dateParts(dateKey: string): [number, number, number] | null {
  const parts = dateKey.split("-").map(Number);
  return parts.length === 3 && parts.every(Number.isInteger) && parts[0] > 0 && parts[1] > 0 && parts[2] > 0
    ? [parts[0], parts[1], parts[2]]
    : null;
}

function sundayWeekNumber(timestamp: number): number {
  const day = new Date(timestamp).getUTCDay();
  return Math.floor((timestamp - day * 86_400_000) / (7 * 86_400_000));
}

export function cyclePositionForDate(dateKey: string, anchorDate: string, cycleLengthWeeks: number): number | null {
  const date = dateParts(dateKey);
  const anchor = dateParts(anchorDate);
  if (!date || !anchor || !Number.isInteger(cycleLengthWeeks) || cycleLengthWeeks < 2) return null;
  const candidateWeek = sundayWeekNumber(Date.UTC(date[0], date[1] - 1, date[2]));
  const anchorWeek = sundayWeekNumber(Date.UTC(anchor[0], anchor[1] - 1, anchor[2]));
  return ((candidateWeek - anchorWeek) % cycleLengthWeeks + cycleLengthWeeks) % cycleLengthWeeks;
}

export function scheduleRuleAppliesToDate(rule: ScheduleRule, dateKey: string): boolean {
  const date = dateParts(dateKey);
  if (!date) return false;
  const dow = new Date(Date.UTC(date[0], date[1] - 1, date[2])).getUTCDay();
  // Regras mensais não dependem dos dias da semana selecionados.
  if (rule.monthlyDayOfMonth != null) return date[2] === rule.monthlyDayOfMonth;
  if (rule.monthlyPosition != null && rule.monthlyWeekday != null) {
    if (dow !== rule.monthlyWeekday) return false;
    if (rule.monthlyPosition === -1) {
      const daysInMonth = new Date(Date.UTC(date[0], date[1], 0)).getUTCDate();
      return date[2] + 7 > daysInMonth;
    }
    return Math.ceil(date[2] / 7) === rule.monthlyPosition;
  }
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(dow)) return false;
  const cycleLength = rule.cycleLengthWeeks && rule.cycleLengthWeeks > 1 ? rule.cycleLengthWeeks : null;
  if (!cycleLength || rule.cyclePosition == null || !rule.cycleAnchorDate) return true;
  return cyclePositionForDate(dateKey, rule.cycleAnchorDate, cycleLength) === rule.cyclePosition;
}

