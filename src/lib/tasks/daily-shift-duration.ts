import { wallDateTimeToISO } from "../wall-clock";
import { resolveWallEndDate } from "./contracted-hours";

/**
 * Duração (min) de uma ocorrência de série: SOMENTE hora início → hora fim do
 * turno diário. Nunca usa as datas da série. Turno que passa da meia-noite soma
 * 24 h à hora fim. Nunca devolve mais de 1440.
 */
export function dailyShiftDurationMinutes(startTime: string, endTime: string): number {
  const parse = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v ?? "");
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  };
  const s = parse(startTime);
  const e = parse(endTime);
  if (s == null || e == null) return 0;
  let diff = e - s;
  if (diff <= 0) diff += 1440;
  return Math.min(1440, Math.max(0, diff));
}

export const LONG_STANDALONE_TASK_MINUTES = 1440;

/** Séries usam o turno diário; tarefas avulsas incluem todas as datas do intervalo. */
export function taskDurationMinutes(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  recurring: boolean,
): number | null {
  if (recurring) return dailyShiftDurationMinutes(startTime, endTime) || null;
  const start = wallDateTimeToISO(startDate, startTime);
  const end = wallDateTimeToISO(resolveWallEndDate(startDate, startTime, endTime, endDate), endTime);
  if (!start || !end) return null;
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}
