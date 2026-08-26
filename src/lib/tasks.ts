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
  /** ADR-044 — registo formal de falta pelo gestor. */
  marked_absent_by?: string | null;
  absence_reason?: string | null;
  absence_justified?: boolean | null;
  absence_source?: "manual" | "automatica" | string | null;
  absence_grace_minutes: number;

  created_at: string;
  updated_at: string;
  punch_mode_override?: PunchMode | null;
  recurrence_id?: string | null;
  /**
   * Fase B — lote de criação multi-responsável. Cada responsável tem a SUA
   * tarefa (estado, ponto, recusa e conclusão próprios). NULL = individual/legada.
   */
  task_group_id?: string | null;

  recurrence_date?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  deleted_at?: string | null;
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
  scheduled_time: string | null;
  duration_minutes: number;
  absence_grace_minutes: number;
  punch_mode_override: PunchMode | null;
  frequency: RecurrenceFrequency;
  weekdays: number[];
  /**
   * Intervalo em semanas para `frequency = weekly` (RRULE FREQ=WEEKLY;INTERVAL=n).
   * Ancorado na semana de `start_date`, preservando o dia da semana (BYDAY).
   * 1 = todas as semanas; 2 = "semana sim, semana não".
   */
  interval_weeks: number;
  /**
   * Regra mensal. Retrocompatível:
   *  • `{ day_of_month: n }` → todo dia n (formato legado, preservado).
   *  • `{ position, weekday }` → BYSETPOS/BYDAY (ex.: última sexta = position -1, weekday 5).
   */
  monthly_rule: { day_of_month?: number; position?: number; weekday?: number };
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

/** Frequência apresentada ao Gestor (biweekly = weekly + interval_weeks 2). */
export type RecurrenceUiFrequency = RecurrenceFrequency | "biweekly";

export const UI_FREQUENCY_LABELS: Record<RecurrenceUiFrequency, string> = {
  daily: "Diariamente",
  weekly: "Semanalmente",
  biweekly: "Semana sim, semana não (a cada 2 semanas)",
  monthly: "Mensalmente",
  custom: "Personalizada",
};

/** Converte a seleção da UI em (frequency, interval_weeks) persistidos. */
export function uiFrequencyToStored(f: RecurrenceUiFrequency): {
  frequency: RecurrenceFrequency;
  intervalWeeks: number;
} {
  return f === "biweekly" ? { frequency: "weekly", intervalWeeks: 2 } : { frequency: f, intervalWeeks: 1 };
}

/** Converte o par persistido na opção exibida ao Gestor. */
export function storedToUiFrequency(frequency: RecurrenceFrequency, intervalWeeks?: number | null): RecurrenceUiFrequency {
  return frequency === "weekly" && (intervalWeeks ?? 1) >= 2 ? "biweekly" : frequency;
}

/** Rótulo humano de uma série já gravada. */
export function recurrenceFrequencyLabel(frequency: RecurrenceFrequency, intervalWeeks?: number | null): string {
  return UI_FREQUENCY_LABELS[storedToUiFrequency(frequency, intervalWeeks)];
}

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

/**
 * Tarefa recusada pelo responsável (SUP-2026-000077).
 * A recusa é uma transição operacional autorizada — nunca um UPDATE livre.
 */
export function isRefused(t: Pick<TaskRow, "status" | "refused_by">): boolean {
  return t.status === "cancelado" && !!t.refused_by;
}

/**
 * Reatribuição explícita de uma tarefa recusada. O histórico da recusa
 * permanece em `public.task_refusals` — a tarefa volta a `pendente`.
 */
export async function reassignFromRefusal(taskId: string, newUser: string): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_reassign_from_refusal", {
    _task_id: taskId,
    _new_user: newUser,
  });
  if (error) throw error;
  return data as TaskRow;
}


export type EditableSeriesPayload = Partial<{
  title: string;
  description: string | null;
  assigned_to: string | null;
  priority: "baixa" | "media" | "alta" | "urgente";
  location: string | null;
  absence_grace_minutes: number;
  punch_mode_override: PunchMode | null;
  scheduled_time: string | null; // HH:MM[:SS] ou null para tarefa por dia
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
  scheduled_for: string | null; // ISO ou null para tarefa por dia
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
  task: Pick<TaskRow, "status" | "scheduled_for" | "recurrence_date" | "due_at">,
): boolean {
  if (task.status === "concluido" || task.status === "cancelado" || task.status === "ausente") return false;

  if (task.scheduled_for) {
    // Tarefa com horário só fica atrasada visualmente 1h após o início.
    return new Date(task.scheduled_for).getTime() + 60 * 60 * 1000 <= Date.now();
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
  task: Pick<TaskRow, "status" | "scheduled_for" | "recurrence_date" | "due_at">,
  now = new Date(),
): boolean {
  if (task.status !== "pendente" && task.status !== "autorizado") return false;

  const threshold = absenceAllowedAt(task);
  if (!threshold) return false;

  if (!task.scheduled_for) {
    threshold.setUTCDate(threshold.getUTCDate() + 1);
  }

  return now.getTime() >= threshold.getTime();
}

/**
 * Ações permitidas para um usuário sobre uma tarefa.
 * Mantém UI espelhada às regras do banco (a regra final está em task_transition).
 */
export function availableActions(
  task: Pick<TaskRow, "status" | "assigned_to"> &
    Partial<Pick<TaskRow, "scheduled_for" | "recurrence_date" | "due_at">>,
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
  // ADR-044 — o gestor pode registar falta a qualquer momento (motivo obrigatório),
  // sem esperar pelo limiar de ausência automática.
  if (ctx.isManager && (task.status === "pendente" || task.status === "autorizado")) out.push("marcar_ausente");
  if (ctx.isManager) out.push("cancelar");

  return out;
}


/**
 * ADR-044 — Registo formal de falta (SUP-2026-000073).
 *
 * O gestor marca falta explicitamente, com motivo obrigatório e classificação
 * (justificada / injustificada). Vale também para tarefas já marcadas como
 * ausentes automaticamente, permitindo completar o registo.
 */
export const ABSENCE_REASONS = [
  "Não compareceu",
  "Falta comunicada pelo funcionário",
  "Doença / atestado",
  "Motivo pessoal",
  "Transporte / deslocação",
  "Outro",
] as const;

export function canMarkAbsent(
  t: Pick<TaskRow, "status" | "assigned_to">,
  ctx: { isManager: boolean },
): boolean {
  if (!ctx.isManager) return false;
  if (!t.assigned_to) return false;
  return t.status === "pendente" || t.status === "autorizado" || t.status === "em_andamento" || t.status === "ausente";
}

export async function markTaskAbsent(taskId: string, reason: string, justified: boolean): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_mark_absent", {
    _task_id: taskId,
    _reason: reason,
    _justified: justified,
  });
  if (error) throw error;
  return data as TaskRow;
}

export const ACTION_LABELS: Record<TaskAction, string> = {
  autorizar: "Autorizar",
  iniciar: "Iniciar",
  concluir: "Concluir",
  recusar: "Recusar",
  cancelar: "Cancelar",
  marcar_ausente: "Marcar falta",
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
 * ADR-036 — "Arquivado" é dimensão de visibilidade, NUNCA status operacional.
 * Cancelamento auditado com motivo obrigatório (gestor ou responsável).
 */
export const CANCEL_REASONS = [
  "Cliente cancelou",
  "Não será realizado",
  "Alteração de programação",
  "Problema de acesso ao local",
  "Falta de material",
  "Problema pessoal",
  "Outro",
] as const;

export async function cancelTask(taskId: string, reason: string): Promise<TaskRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_cancel", {
    _task_id: taskId,
    _reason: reason,
  });
  if (error) throw error;
  return data as TaskRow;
}

/** Gestor cancela qualquer tarefa não finalizada; responsável cancela a sua. */
export function canCancelTask(
  t: Pick<TaskRow, "status" | "assigned_to">,
  ctx: { userId: string; isManager: boolean },
): boolean {
  if (t.status === "cancelado" || t.status === "concluido") return false;
  if (ctx.isManager) return true;
  if (t.assigned_to !== ctx.userId) return false;
  return t.status !== "ausente";
}

/** Erro canónico do backend quando existe ponto aberto na tarefa. */
export function isOpenPunchError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string } | null)?.message ?? "");
  return msg.includes("TASK_HAS_OPEN_PUNCH");
}

/** Funcionário pode arquivar apenas a própria tarefa em estado terminal. */
export function canArchiveBy(
  t: Pick<TaskRow, "status" | "archived_at" | "assigned_to">,
  ctx: { userId: string; isManager: boolean },
): boolean {
  if (!canArchive(t)) return false;
  return ctx.isManager || t.assigned_to === ctx.userId;
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
