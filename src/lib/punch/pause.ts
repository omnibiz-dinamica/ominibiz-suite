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

export type PauseInput = { paused_at: string | null; resumed_at: string | null };

/**
 * Valida a lista de pausas terminadas editada pelo gestor (mesmas regras de
 * punch_admin_set_pauses no banco). Devolve a mensagem de erro ou null.
 */
export function validatePauseList(rows: PauseInput[], startIso: string | null, limitIso: string | null): string | null {
  const start = startIso ? new Date(startIso).getTime() : NaN;
  const limit = limitIso ? new Date(limitIso).getTime() : NaN;
  const parsed: [number, number][] = [];
  for (const r of rows) {
    if (!r.paused_at || !r.resumed_at) return "Cada pausa precisa de início e fim";
    const p = new Date(r.paused_at).getTime();
    const q = new Date(r.resumed_at).getTime();
    if (!Number.isFinite(p) || !Number.isFinite(q)) return "Data/hora de pausa inválida";
    if (q <= p) return "O fim da pausa tem de ser depois do início";
    if ((Number.isFinite(start) && p < start) || (Number.isFinite(limit) && q > limit)) {
      return "Pausa fora do horário do ponto";
    }
    parsed.push([p, q]);
  }
  parsed.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i][0] < parsed[i - 1][1]) return "As pausas não se podem sobrepor";
  }
  return null;
}
