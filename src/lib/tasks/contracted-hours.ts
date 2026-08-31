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
