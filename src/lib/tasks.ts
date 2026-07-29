import { supabase } from "@/integrations/supabase/client";

// Status persistidos (fonte única de verdade no banco)
export const TASK_STATUSES = ["pendente", "autorizado", "em_andamento", "concluido", "cancelado", "ausente"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_ACTIONS = ["autorizar", "iniciar", "concluir", "recusar", "cancelar", "marcar_ausente"] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: "Pendente",
  autorizado: "Autorizado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  ausente: "Ausente",
};

export const STATUS_TONE: Record<TaskStatus, string> = {
  pendente: "bg-info/15 text-info",
  autorizado: "bg-warning/15 text-warning-foreground",
  em_andamento: "bg-primary/15 text-primary",
  concluido: "bg-success/15 text-success",
  cancelado: "bg-muted text-muted-foreground",
  ausente: "bg-destructive/15 text-destructive",
};

export const TERMINAL_STATUSES: TaskStatus[] = ["concluido", "cancelado", "ausente"];

/**
 * Modo de apontamento do cliente (ADR: clientes manuais não têm obrigação de
 * bater entrada — logo, nunca ficam atrasados nem ausentes automaticamente).
 */
export type ClientTimingMode = "start_stop" | "manual";

export function isManualTiming(timing?: ClientTimingMode | string | null): boolean {
  return timing === "manual";
}

/**
 * Enriquecer tarefas com o modo de apontamento do cliente vinculado.
 * Usa RPC SECURITY DEFINER porque o funcionário nem sempre tem acesso
 * direto à ficha do cliente (RLS de `clients`).
 */
export async function attachClientTimingModes<T extends { id: string; client_id: string | null }>(
  tasks: readonly T[],
): Promise<(T & { client_timing_mode: ClientTimingMode | null })[]> {
  const ids = tasks.filter((t) => t.client_id).map((t) => t.id);
  const base = tasks.map((t) => ({ ...t, client_timing_mode: null as ClientTimingMode | null }));
  if (ids.length === 0) return base;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("tasks_timing_modes", { _task_ids: ids });
  if (error || !data) return base;

  const map = new Map<string, ClientTimingMode>();
  for (const row of data as { task_id: string; timing_mode: string }[]) {
    map.set(row.task_id, row.timing_mode as ClientTimingMode);
  }
  return base.map((t) => ({ ...t, client_timing_mode: map.get(t.id) ?? null }));
}

export interface TaskRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: "baixa" | "media" | "alta" | "urgente";
  assigned_to: string | null;
  created_by: string;
  client_id: string | null;
  scheduled_for: string | null;
  scheduled_end: string | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  authorized_at: string | null;
  cancelled_at: string | null;
  refusal_reason?: string | null;
  refused_at?: string | null;
  refused_by?: string | null;
  marked_absent_at: string | null;
  absence_grace_minutes: number;
  created_at: string;
  updated_at: string;
  punch_mode_override?: PunchMode | null;
  recurrence_id?: string | null;
  recurrence_date?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  deleted_at?: string | null;
  /** Preenchido pela UI a partir do cliente vinculado (não é coluna de `tasks`). */
  client_timing_mode?: ClientTimingMode | null;
}

// =========================================================
// Modos de Folha de Ponto
// =========================================================
export type PunchMode = "automatico" | "manual" | "ambos";

export const PUNCH_MODE_LABELS: Record<PunchMode, string> = {
  automatico: "Automático",
  manual: "Manual",
  ambos: "Ambos",
};

export async function punchManualStart(taskId: string): Promise<TimeEntryRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_manual_start", { _task_id: taskId });
  if (error) throw error;
  return data as TimeEntryRow;
}

export async function punchManualEnd(taskId: string): Promise<TimeEntryRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_manual_end", { _task_id: taskId });
  if (error) throw error;
  return data as TimeEntryRow;
}

export async function punchEmployeeManualStart(taskId: string, startedAt: string): Promise<TimeEntryRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_employee_manual_start", {
    _task_id: taskId,
    _started_at: startedAt,
  });
  if (error) throw error;
  return data as TimeEntryRow;
}

export async function punchEmployeeManualEnd(
  timeEntryId: string,
  endedAt: string,
  completeTask = true,
  reason?: string,
): Promise<TimeEntryRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_employee_manual_end", {
    _time_entry_id: timeEntryId,
    _ended_at: endedAt,
    _complete_task: completeTask,
    _reason: reason ?? null,
  });
  if (error) throw error;
  return data as TimeEntryRow;
}

export async function taskEffectivePunchMode(taskId: string): Promise<PunchMode> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_effective_punch_mode", { _task_id: taskId });
  if (error) throw error;
  return (data as PunchMode) ?? "automatico";
}

// =========================================================
// Recorrência
// =========================================================
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "custom";
export type RecurrenceStatus = "active" | "paused" | "ended";

export interface RecurrenceRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  client_id: string | null;
  priority: "baixa" | "media" | "alta" | "urgente";
  location: string | null;
  scheduled_time: string;
  duration_minutes: number;
  absence_grace_minutes: number;
  punch_mode_override: PunchMode | null;
  frequency: RecurrenceFrequency;
  weekdays: number[];
  monthly_rule: { day_of_month?: number };
  start_date: string;
  end_date: string | null;
  status: RecurrenceStatus;
  ended_reason: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  custom: "Personalizada",
};

export const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export async function recurrenceMaterialize(daysAhead = 14, companyId?: string | null): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("recurrence_materialize", {
    _days_ahead: daysAhead,
    _company_id: companyId ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function recurrenceEnd(id: string, reason: string, cancelFuture = true): Promise<RecurrenceRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("recurrence_end", {
    _id: id,
    _reason: reason,
    _cancel_future: cancelFuture,
  });
  if (error) throw error;
  return data as RecurrenceRow;
}

export type ReassignScope = "this" | "future" | "all";

export async function recurrenceReassign(taskId: string, newUser: string, scope: ReassignScope): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("recurrence_reassign", {
    _task_id: taskId,
    _new_user: newUser,
    _scope: scope,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export type EditableSeriesPayload = Partial<{
  title: string;
  description: string | null;
  assigned_to: string | null;
  priority: "baixa" | "media" | "alta" | "urgente";
  location: string | null;
  absence_grace_minutes: number;
  punch_mode_override: PunchMode | null;
  scheduled_time: string; // HH:MM[:SS]
  duration_minutes: number;
}>;

export type EditableOccurrencePayload = Partial<{
  title: string;
  description: string | null;
  assigned_to: string | null;
  priority: "baixa" | "media" | "alta" | "urgente";
  location: string | null;
  absence_grace_minutes: number;
  punch_mode_override: PunchMode | null;
  scheduled_for: string; // ISO
  scheduled_end: string | null; // ISO or null
}>;

export async function recurrenceUpdate(
  recurrenceId: string,
  payload: EditableSeriesPayload,
  scope: "future" | "all",
  fromTaskId?: string | null,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("recurrence_update", {
    _id: recurrenceId,
    _payload: payload,
    _scope: scope,
    _from_task: fromTaskId ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function recurrenceUpdateOccurrence(taskId: string, payload: EditableOccurrencePayload): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("recurrence_update_occurrence", {
    _task_id: taskId,
    _payload: payload,
  });
  if (error) throw error;
  return data as TaskRow;
}

/**
 * Indicador puramente visual — "atrasado" NÃO é persistido.
 * Calculado apenas para renderização.
 */
export function isVisuallyLate(
  task: Pick<TaskRow, "status" | "scheduled_for" | "recurrence_date" | "due_at"> & {
    client_timing_mode?: ClientTimingMode | string | null;
  },
): boolean {
  if (task.status === "concluido" || task.status === "cancelado" || task.status === "ausente") return false;
  // Cliente manual: sem horário obrigatório de entrada → nunca "atrasado".
  if (isManualTiming(task.client_timing_mode)) return false;

  if (task.scheduled_for) {
    return new Date(task.scheduled_for).getTime() < Date.now();
  }

  const dateSource = task.recurrence_date ?? task.due_at;
  if (!dateSource) return false;

  const day = dateSource.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;

  // Tarefa sem horario definido vence visualmente apenas no dia seguinte.
  const nextDay = new Date(`${day}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return Date.now() >= nextDay.getTime();
}

export function absenceAllowedAt(task: Pick<TaskRow, "scheduled_for" | "recurrence_date" | "due_at">): Date | null {
  if (task.scheduled_for) {
    return new Date(new Date(task.scheduled_for).getTime() + 60 * 60 * 1000);
  }

  const dateSource = task.recurrence_date ?? task.due_at;
  if (!dateSource) return null;

  const day = dateSource.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  return new Date(`${day}T00:00:00.000Z`);
}

export function canBecomeAbsent(
  task: Pick<TaskRow, "status" | "scheduled_for" | "recurrence_date" | "due_at"> & {
    client_timing_mode?: ClientTimingMode | string | null;
  },
  now = new Date(),
): boolean {
  if (task.status !== "pendente" && task.status !== "autorizado") return false;
  // Cliente manual: ausência (automática ou manual) não se aplica.
  if (isManualTiming(task.client_timing_mode)) return false;

  const threshold = absenceAllowedAt(task);
  if (!threshold) return false;

  if (!task.scheduled_for) {
    threshold.setUTCDate(threshold.getUTCDate() + 1);
  }

  return now.getTime() >= threshold.getTime();
}

type SortableTask = Pick<
  TaskRow,
  | "id"
  | "title"
  | "status"
  | "scheduled_for"
  | "due_at"
  | "started_at"
  | "completed_at"
  | "cancelled_at"
  | "marked_absent_at"
  | "updated_at"
> & { recurrence_date?: string | null; client_timing_mode?: ClientTimingMode | string | null };

const FAR_FUTURE = "9999-12-31T23:59";

/** Chave cronológica wall-clock da OCORRÊNCIA (data + horário, sem fuso). */
function chronoKey(t: SortableTask): string {
  if (t.scheduled_for) {
    const d = new Date(t.scheduled_for);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      // `0` = com horário definido (vem antes no mesmo dia)
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}|0|${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }
  }
  const fallback = t.recurrence_date ?? t.due_at;
  if (fallback) {
    const d = new Date(fallback);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      // `1` = sem horário definido → final do próprio dia
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}|1|`;
    }
  }
  return `${FAR_FUTURE}|2|`;
}

function ts(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Bucket operacional (menor = mais relevante para a operação atual). */
export function taskSortBucket(t: SortableTask): number {
  if (t.status === "em_andamento") return 0;
  if (t.status === "pendente" || t.status === "autorizado") {
    return isVisuallyLate(t) ? 1 : 2;
  }
  if (t.status === "ausente") return 3;
  if (t.status === "concluido") return 4;
  return 5; // cancelado
}

/** Comparador canônico. Use sempre via `sortTasksForDisplay`. */
export function compareTasksForDisplay(a: SortableTask, b: SortableTask): number {
  const ba = taskSortBucket(a);
  const bb = taskSortBucket(b);
  if (ba !== bb) return ba - bb;

  switch (ba) {
    case 0:
      // Em andamento: iniciadas mais recentemente primeiro.
      return ts(b.started_at) - ts(a.started_at) || chronoKey(a).localeCompare(chronoKey(b));
    case 3:
      return ts(b.marked_absent_at) - ts(a.marked_absent_at) || chronoKey(b).localeCompare(chronoKey(a));
    case 4:
      // Concluídas: conclusão oficial (`completed_at`) mais recente primeiro.
      return ts(b.completed_at) - ts(a.completed_at) || chronoKey(b).localeCompare(chronoKey(a));
    case 5:
      return ts(b.cancelled_at) - ts(a.cancelled_at) || chronoKey(b).localeCompare(chronoKey(a));
    default:
      // Atrasadas e pendentes: cronológico ascendente.
      return chronoKey(a).localeCompare(chronoKey(b)) || a.title.localeCompare(b.title);
  }
}

/** Ordena qualquer lista de tarefas pela regra oficial (não muta a original). */
export function sortTasksForDisplay<T extends SortableTask>(list: readonly T[]): T[] {
  return list.slice().sort(compareTasksForDisplay);
}

/** Ordenação estritamente cronológica da ocorrência — usada dentro de um mesmo dia (calendário). */
export function compareTasksChronologically(a: SortableTask, b: SortableTask): number {
  return chronoKey(a).localeCompare(chronoKey(b)) || compareTasksForDisplay(a, b);
}

/**
 * Ações permitidas para um usuário sobre uma tarefa.
 * Mantém UI espelhada às regras do banco (a regra final está em task_transition).
 */
export function availableActions(
  task: Pick<TaskRow, "status" | "assigned_to"> &
    Partial<Pick<TaskRow, "scheduled_for" | "recurrence_date" | "due_at">> & {
      client_timing_mode?: ClientTimingMode | string | null;
    },
  ctx: { userId: string; isManager: boolean },
): TaskAction[] {
  const isAssignee = task.assigned_to === ctx.userId;
  const out: TaskAction[] = [];
  if (TERMINAL_STATUSES.includes(task.status)) return out;

  if (task.status === "pendente" && ctx.isManager) out.push("autorizar");
  if ((task.status === "pendente" || task.status === "autorizado") && (isAssignee || ctx.isManager))
    out.push("iniciar");
  if ((task.status === "pendente" || task.status === "autorizado") && isAssignee) out.push("recusar");
  if (task.status === "em_andamento" && (isAssignee || ctx.isManager)) out.push("concluir");
  if (
    ctx.isManager &&
    canBecomeAbsent({
      status: task.status,
      scheduled_for: task.scheduled_for ?? null,
      recurrence_date: task.recurrence_date ?? null,
      due_at: task.due_at ?? null,
      client_timing_mode: task.client_timing_mode ?? null,
    })
  )
    out.push("marcar_ausente");
  if (ctx.isManager) out.push("cancelar");

  return out;
}

export const ACTION_LABELS: Record<TaskAction, string> = {
  autorizar: "Autorizar",
  iniciar: "Iniciar",
  concluir: "Concluir",
  recusar: "Recusar",
  cancelar: "Cancelar",
  marcar_ausente: "Marcar ausente",
};

/**
 * Executa uma transição via RPC central. Toda regra de negócio
 * (validação, carimbo de tempo, permissões) vive no banco.
 */
export async function transitionTask(taskId: string, action: TaskAction, reason?: string): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_transition", {
    _task_id: taskId,
    _action: action,
    _reason: reason ?? null,
  });
  if (error) throw error;
  return data as TaskRow;
}

/** Arquiva (soft) ou desarquiva uma tarefa. Apenas estados terminais podem ser arquivados. */
export async function archiveTask(taskId: string, archive = true): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_archive", {
    _task_id: taskId,
    _archive: archive,
  });
  if (error) throw error;
  return data as TaskRow;
}

/** Estados terminais elegíveis para arquivamento. */
export function canArchive(t: Pick<TaskRow, "status" | "archived_at">): boolean {
  if (t.archived_at) return false;
  return t.status === "concluido" || t.status === "cancelado" || t.status === "ausente";
}

/**
 * Processa ausências por evento (chamado no carregamento da tela
 * ou após ações pontuais). NUNCA em loop.
 */
export async function sweepAbsent(companyId: string | null): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("tasks_sweep_absent", {
    _company_id: companyId,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// =========================================================
// Folha de ponto — extensão operacional da tarefa
// =========================================================
export interface TimeEntryRow {
  id: string;
  company_id: string;
  task_id: string | null;
  user_id: string;
  started_at: string;
  paused_at: string | null;
  resumed_at: string | null;
  ended_at: string | null;
  effective_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  entry_kind?: "work" | "paid_leave";
  paid_leave_minutes?: number | null;
}

export type PunchState = "aberto" | "pausado" | "encerrado";

export function punchState(entry: Pick<TimeEntryRow, "paused_at" | "resumed_at" | "ended_at">): PunchState {
  if (entry.ended_at) return "encerrado";
  if (entry.paused_at && !entry.resumed_at) return "pausado";
  return "aberto";
}

export async function punchPause(note?: string): Promise<TimeEntryRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_pause", { _note: note ?? null });
  if (error) throw error;
  return data as TimeEntryRow;
}

export async function punchResume(): Promise<TimeEntryRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_resume");
  if (error) throw error;
  return data as TimeEntryRow;
}

/** Solicita nova autorização para uma tarefa ausente/rejeitada. Volta a 'pendente'. */
export async function requestTaskAuthorization(taskId: string, note?: string): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_request_authorization", {
    _task_id: taskId,
    _note: note ?? null,
  });
  if (error) throw error;
  return data as TaskRow;
}

/**
 * Duração efetiva (minutos) — arredondamento half-up consistente com o banco
 * (effective_minutes_round). Use sempre para exibir minutos persistidos/preview.
 */
export function effectiveMinutesNow(e: TimeEntryRow): number {
  const start = new Date(e.started_at).getTime();
  const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now();
  let pauseMs = 0;
  if (e.paused_at) {
    const p = new Date(e.paused_at).getTime();
    const r = e.resumed_at
      ? new Date(e.resumed_at).getTime()
      : e.ended_at
        ? new Date(e.ended_at).getTime()
        : Date.now();
    pauseMs = Math.max(0, r - p);
  }
  const seconds = Math.max(0, (end - start - pauseMs) / 1000);
  // Half-up: Math.floor(x + 0.5) trata exatamente como round() do Postgres em positivos.
  return Math.max(0, Math.floor(seconds / 60 + 0.5));
}

export function formatDuration(min: number): string {
  // Formato canônico HH:MM (ex.: 01:30, 08:00). Nunca minutos brutos ao utilizador.
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Duração efetiva em SEGUNDOS para cronômetro vivo (HH:MM:SS). */
export function effectiveSecondsNow(e: TimeEntryRow): number {
  const start = new Date(e.started_at).getTime();
  const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now();
  let pauseMs = 0;
  if (e.paused_at) {
    const p = new Date(e.paused_at).getTime();
    const r = e.resumed_at
      ? new Date(e.resumed_at).getTime()
      : e.ended_at
        ? new Date(e.ended_at).getTime()
        : Date.now();
    pauseMs = Math.max(0, r - p);
  }
  return Math.max(0, Math.floor((end - start - pauseMs) / 1000));
}

export function formatHMS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
