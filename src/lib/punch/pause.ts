export type PauseEntry = {
  paused_at: string | null;
  resumed_at: string | null;
  ended_at: string | null;
};

/** Duração da pausa em minutos, usando o mesmo intervalo do cálculo efetivo. */
export function pauseMinutesNow(entry: PauseEntry): number | null {
  if (!entry.paused_at) return null;
  const pausedAt = new Date(entry.paused_at).getTime();
  const resumeAt = entry.resumed_at
    ? new Date(entry.resumed_at).getTime()
    : entry.ended_at
      ? new Date(entry.ended_at).getTime()
      : Date.now();
  if (!Number.isFinite(pausedAt) || !Number.isFinite(resumeAt)) return 0;
  return Math.max(0, Math.floor((resumeAt - pausedAt) / 60000 + 0.5));
}
