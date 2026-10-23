export type PauseEntry = {
  paused_at: string | null;
  resumed_at: string | null;
  ended_at: string | null;
  /** Soma (segundos) das pausas anteriores à pausa atual — várias pausas por ponto. */
  prior_pause_seconds?: number | null;
};

/** Uma pausa registada em public.time_entry_pauses (todas as pausas de um ponto). */
export type TimeEntryPauseRow = {
  time_entry_id: string;
  paused_at: string;
  resumed_at: string | null;
  is_current: boolean;
};

/** Duração da pausa em minutos, usando o mesmo intervalo do cálculo efetivo. Inclui as pausas anteriores. */
export function pauseMinutesNow(entry: PauseEntry): number | null {
  const priorSec = Math.max(0, Number(entry.prior_pause_seconds ?? 0) || 0);
  if (!entry.paused_at) return priorSec > 0 ? Math.floor(priorSec / 60 + 0.5) : null;
  const pausedAt = new Date(entry.paused_at).getTime();
  const resumeAt = entry.resumed_at
    ? new Date(entry.resumed_at).getTime()
    : entry.ended_at
      ? new Date(entry.ended_at).getTime()
      : Date.now();
  if (!Number.isFinite(pausedAt) || !Number.isFinite(resumeAt)) return 0;
  return Math.max(0, Math.floor((Math.max(0, resumeAt - pausedAt) + priorSec * 1000) / 60000 + 0.5));
}

/** Lista legível das pausas de um ponto, ex.: "12:54–13:12 · 16:57–16:57". */
export function formatPauseList(rows: TimeEntryPauseRow[], timeZone?: string): string {
  const fmt = (iso: string | null) => {
    if (!iso) return "…";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "…";
    return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
  };
  return [...rows]
    .sort((a, b) => new Date(a.paused_at).getTime() - new Date(b.paused_at).getTime())
    .map((p) => fmt(p.paused_at) + "–" + fmt(p.resumed_at))
    .join(" · ");
}
