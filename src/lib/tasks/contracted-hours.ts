/**
 * Carga contratada do cliente é armazenada em minutos inteiros para evitar
 * cálculos com floats e permitir qualquer combinação de horas e minutos.
 */
export function distributeContractedMinutes(totalMinutes: number | null | undefined, employeeCount: number): number[] {
  if (
    totalMinutes == null ||
    !Number.isInteger(totalMinutes) ||
    totalMinutes <= 0 ||
    !Number.isInteger(employeeCount) ||
    employeeCount <= 0
  ) {
    return [];
  }

  const base = Math.floor(totalMinutes / employeeCount);
  const remainder = totalMinutes % employeeCount;
  return Array.from({ length: employeeCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** Converts a valid wall-clock time (HH:MM) to minutes since midnight. */
export function wallTimeToMinutes(time: string | null | undefined): number | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Calculates a positive wall-clock interval. A finish before the start is an
 * overnight interval; equal times remain invalid instead of meaning 24 hours.
 */
export function calculateWallDurationMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null {
  const start = wallTimeToMinutes(startTime);
  const end = wallTimeToMinutes(endTime);
  if (start == null || end == null || start === end) return null;
  return end > start ? end - start : 24 * 60 - start + end;
}

export function isOvernightTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): boolean {
  const start = wallTimeToMinutes(startTime);
  const end = wallTimeToMinutes(endTime);
  return start != null && end != null && end < start;
}

export function addWallMinutes(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch || !Number.isInteger(minutes) || minutes < 0) return null;

  const value = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  const result = new Date(value + minutes * 60_000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    date: `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`,
    time: `${pad(result.getUTCHours())}:${pad(result.getUTCMinutes())}`,
  };
}

export function formatContractedMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isInteger(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h${String(remaining).padStart(2, "0")}` : `${hours}h`;
}
