import { supabase } from "@/integrations/supabase/client";
import { pauseMinutesNow } from "@/lib/punch/pause";
import {
  formatStartedLateMinutes,
  resolveOperationalStatus,
  startedLateMinutes,
  wallClockEpoch,
} from "@/lib/tasks/operational-rules";
import type { ScheduleProposal, TaskScheduleConflict } from "@/lib/tasks/schedule-conflicts";
export { intervalsOverlap, overlapInterval } from "@/lib/tasks/schedule-conflicts";
export type { ScheduleProposal, TaskScheduleConflict } from "@/lib/tasks/schedule-conflicts";
export { pauseMinutesNow } from "@/lib/punch/pause";
export {
  automaticAbsenceAllowedAt,
  formatStartedLateMinutes,
  resolveOperationalStatus,
  startedLateMinutes,
  isBulkArchiveEligible,
  isBulkDeleteEligible,
  isSingleTask,
} from "@/lib/tasks/operational-rules";

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
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  refusal_reason?: string | null;
  refused_at?: string | null;
  refused_by?: string | null;
  marked_absent_at: string | null;
  /** ADR-044 — registo formal de falta pelo gestor. */
  marked_absent_by?: string | null;
  absence_reason?: string | null;
  absence_justified?: boolean | null;
  absence_source?: "manual" | "employee" | "automatica" | string | null;
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
  /** Justificativa operacional quando a tarefa não recebeu START. */
  no_start_reason?: string | null;
  no_start_reason_at?: string | null;
  no_start_reason_by?: string | null;
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
  /** Explicit date-only occurrences for frequency=custom. */
  selected_dates: string[];
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

/**
 * Frequência apresentada ao Gestor.
 *  • biweekly    = weekly + interval_weeks 2.
 *  • monthly_pos = monthly + monthly_rule { position, weekday }.
 */
export type RecurrenceUiFrequency = RecurrenceFrequency | "biweekly" | "monthly_pos";

export const UI_FREQUENCY_LABELS: Record<RecurrenceUiFrequency, string> = {
  daily: "Diariamente",
  weekly: "Semanalmente",
  biweekly: "Semana sim, semana não (a cada 2 semanas)",
  monthly: "Mensalmente (dia do mês)",
  monthly_pos: "Mensalmente (posição no mês)",
  custom: "Personalizada",
};

export const MONTH_POSITIONS = [
  { value: 1, label: "Primeira" },
  { value: 2, label: "Segunda" },
  { value: 3, label: "Terceira" },
  { value: 4, label: "Quarta" },
  { value: -1, label: "Última" },
] as const;

export function monthPositionLabel(position: number): string {
  return MONTH_POSITIONS.find((p) => p.value === position)?.label ?? String(position);
}

/** Converte a seleção da UI em (frequency, interval_weeks) persistidos. */
export function uiFrequencyToStored(f: RecurrenceUiFrequency): {
  frequency: RecurrenceFrequency;
  intervalWeeks: number;
} {
  if (f === "biweekly") return { frequency: "weekly", intervalWeeks: 2 };
  if (f === "monthly_pos") return { frequency: "monthly", intervalWeeks: 1 };
  return { frequency: f, intervalWeeks: 1 };
}

/** Converte o par persistido na opção exibida ao Gestor. */
export function storedToUiFrequency(
  frequency: RecurrenceFrequency,
  intervalWeeks?: number | null,
  monthlyRule?: RecurrenceRow["monthly_rule"] | null,
): RecurrenceUiFrequency {
  if (frequency === "weekly" && (intervalWeeks ?? 1) >= 2) return "biweekly";
  if (frequency === "monthly" && monthlyRule?.position != null && monthlyRule?.weekday != null) return "monthly_pos";
  return frequency;
}

/** Rótulo humano de uma série já gravada. */
export function recurrenceFrequencyLabel(
  frequency: RecurrenceFrequency,
  intervalWeeks?: number | null,
  monthlyRule?: RecurrenceRow["monthly_rule"] | null,
): string {
  return UI_FREQUENCY_LABELS[storedToUiFrequency(frequency, intervalWeeks, monthlyRule)];
}

export const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ---------------------------------------------------------
// Pré-visualização de ocorrências (espelha public.recurrence_materialize)
// ---------------------------------------------------------
export interface RecurrencePreviewInput {
  frequency: RecurrenceFrequency;
  intervalWeeks: number;
  weekdays: number[];
  monthlyRule: RecurrenceRow["monthly_rule"];
  startDate: string;
  endDate?: string | null;
}

const toDate = (iso: string) => new Date(`${iso}T12:00:00`);
const weekStart = (d: Date) => {
  const c = new Date(d);
  c.setDate(c.getDate() - c.getDay());
  return c;
};

/** Datas das próximas N ocorrências, na mesma lógica do motor no banco. */
export function previewRecurrenceDates(input: RecurrencePreviewInput, count = 5): Date[] {
  if (!input.startDate) return [];
  const start = toDate(input.startDate);
  const end = input.endDate ? toDate(input.endDate) : null;
  const anchor = weekStart(start);
  const interval = Math.max(1, input.intervalWeeks || 1);
  const out: Date[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < 800 && out.length < count; i++) {
    if (end && cursor > end) break;
    const dow = cursor.getDay();
    let match = false;
    if (input.frequency === "daily") {
      match = true;
    } else if (input.frequency === "weekly") {
      match = input.weekdays.includes(dow);
      if (match && interval > 1) {
        const offset = Math.round((weekStart(cursor).getTime() - anchor.getTime()) / (7 * 86_400_000));
        match = offset % interval === 0;
      }
    } else if (input.frequency === "monthly") {
      const { position, weekday, day_of_month: dom } = input.monthlyRule ?? {};
      if (position != null && weekday != null) {
        if (dow === weekday) {
          if (position === -1) {
            const probe = new Date(cursor);
            probe.setDate(probe.getDate() + 7);
            match = probe.getMonth() !== cursor.getMonth();
          } else {
            match = Math.floor((cursor.getDate() - 1) / 7) + 1 === position;
          }
        }
      } else {
        match = cursor.getDate() === (dom ?? start.getDate());
      }
    }
    if (match) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Frase-exemplo dinâmica exibida no formulário. */
export function describeRecurrence(input: RecurrencePreviewInput): string {
  const ui = storedToUiFrequency(input.frequency, input.intervalWeeks, input.monthlyRule);
  if (ui === "daily") return "Todos os dias.";
  if (ui === "weekly")
    return input.weekdays.length > 0
      ? `Toda semana: ${input.weekdays.map((d) => WEEKDAY_FULL[d]).join(", ")}.`
      : "Selecione os dias da semana.";
  if (ui === "biweekly")
    return `A cada 2 semanas: ${(input.weekdays.length ? input.weekdays : [toDate(input.startDate || new Date().toISOString().slice(0, 10)).getDay()])
      .map((d) => WEEKDAY_FULL[d])
      .join(", ")} (semana sim, semana não).`;
  if (ui === "monthly_pos")
    return `Ex.: ${monthPositionLabel(input.monthlyRule?.position ?? 1).toLowerCase()} ${
      WEEKDAY_FULL[input.monthlyRule?.weekday ?? 5]
    } de cada mês.`;
  if (ui === "monthly") return `Todo dia ${input.monthlyRule?.day_of_month ?? 1} de cada mês.`;
  return "Regra personalizada.";
}

export async function recurrenceMaterialize(daysAhead = 60, companyId?: string | null): Promise<number> {
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
  task: Pick<TaskRow, "status" | "scheduled_for" | "recurrence_date" | "due_at" | "absence_source">,
): boolean {
  return resolveOperationalStatus(task) === "atrasada";
}

/**
 * Consulta em lote os compromissos que colidem com os intervalos propostos.
 * A RPC aplica company_id/RLS no banco; a UI nunca carrega a agenda inteira.
 */
export async function checkTaskScheduleConflicts(
  companyId: string,
  proposals: ScheduleProposal[],
  excludeTaskId?: string | null,
): Promise<TaskScheduleConflict[]> {
  if (!companyId || proposals.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_schedule_conflicts", {
    _company_id: companyId,
    _proposals: proposals,
    _exclude_task_id: excludeTaskId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as TaskScheduleConflict[];
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

  return wallClockEpoch(now) >= threshold.getTime();
}

export async function recordNoStartReason(taskId: string, reason: string): Promise<TaskRow> {
  const normalized = reason.trim();
  if (!normalized) throw new Error("Informe o motivo de não ter iniciado a tarefa.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_record_no_start_reason", {
    _task_id: taskId,
    _reason: normalized,
  });
  if (error) throw error;
  return data as TaskRow;
}

export async function updateTaskAbsence(taskId: string, reason: string, justified: boolean): Promise<TaskRow> {
  const normalized = reason.trim();
  if (!normalized) throw new Error("Informe o motivo da falta.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_update_absence", {
    _task_id: taskId,
    _reason: normalized,
    _justified: justified,
  });
  if (error) throw error;
  return data as TaskRow;
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
  const operationalStatus = resolveOperationalStatus({
    ...task,
    scheduled_for: task.scheduled_for ?? null,
    recurrence_date: task.recurrence_date ?? null,
    due_at: task.due_at ?? null,
  });
  // Uma ausencia automatica antiga pode estar persistida antes do prazo. Nesse
  // caso, trata-se como pendente/atrasada ate a migration normalizar a linha.
  const actionableStatus: TaskStatus | "atrasada" =
    operationalStatus === "atrasada"
      ? task.status === "autorizado"
        ? "autorizado"
        : "pendente"
      : operationalStatus;
  if (TERMINAL_STATUSES.includes(actionableStatus as TaskStatus)) return out;

  if (actionableStatus === "pendente" && ctx.isManager) out.push("autorizar");
  if ((actionableStatus === "pendente" || actionableStatus === "autorizado") && (isAssignee || ctx.isManager))
    out.push("iniciar");
  if ((actionableStatus === "pendente" || actionableStatus === "autorizado") && isAssignee) out.push("recusar");
  if (actionableStatus === "em_andamento" && (isAssignee || ctx.isManager)) out.push("concluir");
  // A falta só pode ser registada depois da ocorrência: 1h após o horário
  // definido ou no dia seguinte quando a tarefa não tem horário.
  if (
    (ctx.isManager || isAssignee) &&
    (actionableStatus === "pendente" || actionableStatus === "autorizado") &&
    canBecomeAbsent({
      ...task,
      scheduled_for: task.scheduled_for ?? null,
      recurrence_date: task.recurrence_date ?? null,
      due_at: task.due_at ?? null,
    })
  )
    out.push("marcar_ausente");
  if (ctx.isManager) out.push("cancelar");

  return out;
}


/**
 * ADR-044 — Registo formal de falta (SUP-2026-000073).
 *
 * O funcionário responsável ou o gestor marca falta explicitamente, com motivo
 * obrigatório e classificação (justificada / injustificada). Vale também para tarefas já marcadas como
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
  t: Pick<TaskRow, "status" | "assigned_to" | "scheduled_for" | "recurrence_date" | "due_at">,
  ctx: { isManager: boolean; userId?: string | null },
): boolean {
  if (!t.assigned_to) return false;
  if (!ctx.isManager && t.assigned_to !== ctx.userId) return false;
  return (
    (t.status === "pendente" || t.status === "autorizado") &&
    canBecomeAbsent(t)
  );
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

/** Registra a observação histórica da conclusão sem alterar o estado da tarefa. */
export async function addTaskCompletionNote(taskId: string, note: string): Promise<void> {
  const normalized = note.trim();
  if (!normalized) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("task_add_completion_note", {
    _task_id: taskId,
    _note: normalized,
  });
  if (error) {
    console.error("[task-completion-note] RPC error", {
      taskId,
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    throw error;
  }
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

/**
 * ADR-051 — Exclusão segura de tarefas recorrentes.
 *
 * `single` remove apenas a ocorrência (o motor não a recria, pois a linha
 * permanece com `deleted_at`); `future` remove a ocorrência escolhida e as
 * futuras, preserva as passadas e encerra a série na data de corte.
 * Ocorrências com histórico operacional são canceladas, nunca apagadas.
 */
export type DeleteSeriesScope = "single" | "future";

export type DeleteSeriesResult = {
  scope: DeleteSeriesScope;
  cutoff_date: string;
  deleted: number;
  cancelled: number;
  kept: number;
  series_ended: boolean;
};

export async function deleteTaskSeries(
  taskId: string,
  scope: DeleteSeriesScope,
  reason?: string,
): Promise<DeleteSeriesResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("task_series_delete", {
    _task_id: taskId,
    _scope: scope,
    _reason: reason?.trim() ? reason.trim() : null,
  });
  if (error) throw error;
  return data as DeleteSeriesResult;
}
