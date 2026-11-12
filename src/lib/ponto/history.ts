/**
 * Histórico do funcionário (12/11/2026): os seus pontos encerrados com o
 * previsto da tarefa, entrada/saída, pausas e total. Só apresentação: os dados
 * vêm de time_entries / time_entry_pauses com as regras de acesso do banco.
 */
import { formatWallTime } from "@/lib/wall-clock";

export type HistoryTask = {
  title: string | null;
  client_id: string | null;
  scheduled_for: string | null;
  scheduled_end: string | null;
  recurrence_date: string | null;
};

export type HistoryEntry = {
  id: string;
  started_at: string;
  ended_at: string | null;
  effective_minutes: number | null;
  paused_at: string | null;
  resumed_at: string | null;
  prior_pause_seconds: number | null;
  task_id: string | null;
  tasks: HistoryTask | null;
  /** Vem de my_punch_history (também em tarefas arquivadas). */
  client_name?: string | null;
  work_date?: string | null;
  pauses?: { paused_at: string; resumed_at: string | null }[];
};

/** Linha devolvida pela função my_punch_history (12/11/2026). */
export type HistoryRpcRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  effective_minutes: number | null;
  paused_at: string | null;
  resumed_at: string | null;
  prior_pause_seconds: number | null;
  task_id: string | null;
  task_title: string | null;
  client_id: string | null;
  client_name: string | null;
  scheduled_for: string | null;
  scheduled_end: string | null;
  recurrence_date: string | null;
  work_date: string | null;
  pauses: { paused_at: string; resumed_at: string | null }[] | null;
};

export function fromHistoryRpc(r: HistoryRpcRow): HistoryEntry {
  return {
    id: r.id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    effective_minutes: r.effective_minutes,
    paused_at: r.paused_at,
    resumed_at: r.resumed_at,
    prior_pause_seconds: r.prior_pause_seconds,
    task_id: r.task_id,
    tasks: r.task_id
      ? {
          title: r.task_title,
          client_id: r.client_id,
          scheduled_for: r.scheduled_for,
          scheduled_end: r.scheduled_end,
          recurrence_date: r.recurrence_date,
        }
      : null,
    client_name: r.client_name,
    work_date: r.work_date,
    pauses: r.pauses ?? [],
  };
}

export type PauseRow = {
  time_entry_id: string;
  paused_at: string;
  resumed_at: string | null;
};

export type PauseItem = { start: string | null; end: string | null; seconds: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" do instante no fuso do aparelho. */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Dia da tarefa (data de parede); sem tarefa, o dia do ponto. */
export function taskDayKey(
  entry: Pick<HistoryEntry, "started_at" | "tasks" | "work_date">,
): string {
  if (entry.work_date) return entry.work_date.slice(0, 10);
  const t = entry.tasks;
  if (t?.recurrence_date) return t.recurrence_date.slice(0, 10);
  if (t?.scheduled_for) return t.scheduled_for.slice(0, 10);
  return localDateKey(entry.started_at);
}

/**
 * Horário previsto "08:00–12:00" (horário de parede). Nas recorrências o
 * scheduled_end guarda o fim da série: usa-se só a hora.
 */
export function plannedWindow(task: HistoryTask | null | undefined): string | null {
  if (!task?.scheduled_for) return null;
  const start = formatWallTime(task.scheduled_for);
  const end = task.scheduled_end ? formatWallTime(task.scheduled_end) : "";
  return end ? `${start}–${end}` : start;
}

/** "00:15:02" */
export function formatPauseSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Pausas TERMINADAS de um ponto, por ordem. Usa time_entry_pauses; pontos
 * antigos só têm a última pausa (paused_at/resumed_at) e o total anterior.
 */
export function finishedPauses(
  entry: {
    paused_at: string | null;
    resumed_at: string | null;
    prior_pause_seconds?: number | null;
  },
  rows: PauseRow[] | undefined,
): PauseItem[] {
  const done = (rows ?? [])
    .filter((r) => r.resumed_at)
    .sort((a, b) => new Date(a.paused_at).getTime() - new Date(b.paused_at).getTime())
    .map((r) => ({
      start: r.paused_at,
      end: r.resumed_at,
      seconds: Math.max(
        0,
        (new Date(r.resumed_at!).getTime() - new Date(r.paused_at).getTime()) / 1000,
      ),
    }));
  if (done.length > 0) return done;
  const out: PauseItem[] = [];
  const prior = Number(entry.prior_pause_seconds ?? 0) || 0;
  if (prior > 0) out.push({ start: null, end: null, seconds: prior });
  if (entry.paused_at && entry.resumed_at) {
    out.push({
      start: entry.paused_at,
      end: entry.resumed_at,
      seconds: Math.max(
        0,
        (new Date(entry.resumed_at).getTime() - new Date(entry.paused_at).getTime()) / 1000,
      ),
    });
  }
  return out;
}

const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Filtros do histórico: dia da tarefa entre from/to (inclusive) e cliente. */
export function filterHistory(
  entries: HistoryEntry[],
  opts: {
    from?: string;
    to?: string;
    clientId?: string;
    clientNames?: Record<string, string>;
    text?: string;
  },
): HistoryEntry[] {
  const words = norm(opts.text).split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    const day = taskDayKey(e);
    if (opts.from && day < opts.from) return false;
    if (opts.to && day > opts.to) return false;
    if (opts.clientId && e.tasks?.client_id !== opts.clientId) return false;
    if (words.length) {
      const name =
        e.client_name ?? (e.tasks?.client_id ? opts.clientNames?.[e.tasks.client_id] : "");
      const hay = norm(`${name ?? ""} ${e.tasks?.title ?? ""}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}
