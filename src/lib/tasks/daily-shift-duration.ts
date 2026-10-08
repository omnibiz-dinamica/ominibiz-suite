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
