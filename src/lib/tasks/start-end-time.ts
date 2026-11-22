/**
 * 22/11/2026 — "Editar recorrência" passa a pedir hora de início e de fim (em
 * vez de hora + duração). A duração continua a ser o que se grava; estes
 * helpers convertem entre as duas formas. Fim antes do início = passa da
 * meia-noite (ex.: 22:00 → 02:00 = 240 min).
 */
const toMin = (hhmm: string): number | null => {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
};

/** "09:00" + 210 min → "12:30". Sem início ou duração 0 → "". */
export function endTimeFromDuration(start: string, minutes: number): string {
  const s = toMin(start);
  if (s === null || !minutes || minutes <= 0) return "";
  const e = (s + Math.round(minutes)) % 1440;
  return `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
}

/** "09:00" → "12:30" = 210. Fim ≤ início conta como dia seguinte. Inválido → 0. */
export function durationFromTimes(start: string, end: string): number {
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null) return 0;
  const d = e - s;
  return d > 0 ? d : d + 1440;
}
