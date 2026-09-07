import { supabase } from "@/integrations/supabase/client";
import type { TimeEntryRow } from "@/lib/tasks";
import {
  resolveTaskOperationalNotes,
  type TaskCancellationNoteEvent,
  type TaskCompletionNoteEvent,
  type TaskNoteTaskSnapshot,
  type TaskOperationalNote,
} from "@/lib/ponto/task-notes";
import type { TaskRefusalRecord } from "@/lib/task-refusal-view";

export type PunchOrigin =
  | "employee_punch"
  | "manager_manual"
  | "manager_correction"
  | "manager_voided"
  | "manual_adjustment"
  | "paid_leave"
  | "vacation";

export interface AdminTimeEntry extends TimeEntryRow {
  origin: PunchOrigin;
  created_by: string | null;
  last_edited_by: string | null;
  last_edited_at: string | null;
  last_edit_reason: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  entry_kind?: "work" | "paid_leave";
  paid_leave_minutes?: number | null;
}

export interface PunchAuditRow {
  id: string;
  time_entry_id: string;
  company_id: string;
  action: "create" | "update" | "delete";
  changed_by: string;
  changed_at: string;
  reason: string;
  changes: Record<string, { old: unknown; new: unknown }>;
}

export interface PunchCreatePayload {
  task_id?: string | null;
  user_id: string;
  started_at: string;
  ended_at?: string | null;
  paused_at?: string | null;
  resumed_at?: string | null;
  notes?: string | null;
}

export type PunchUpdatePayload = Partial<{
  started_at: string | null;
  ended_at: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  notes: string | null;
  effective_minutes: number | null;
}>;

export async function punchAdminCreate(payload: PunchCreatePayload, reason: string): Promise<AdminTimeEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_admin_create", {
    _payload: payload,
    _reason: reason,
  });
  if (error) throw error;
  return data as AdminTimeEntry;
}

/** Regulariza uma falta existente com o horário real informado pelo gestor. */
export async function punchAbsenceRegularize(
  taskId: string,
  startedAt: string,
  endedAt: string | null,
  reason: string,
): Promise<AdminTimeEntry> {
  // A RPC existente valida gestor, empresa, conflitos e grava a regularização numa transação.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_employee_regularize", {
    _task_id: taskId,
    _started_at: startedAt,
    _ended_at: endedAt,
    _reason: reason,
  });
  if (error) throw error;
  return data as AdminTimeEntry;
}

export async function punchAdminUpdate(
  id: string,
  payload: PunchUpdatePayload,
  reason: string,
): Promise<AdminTimeEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_admin_update", {
    _id: id,
    _payload: payload,
    _reason: reason,
  });
  if (error) throw error;
  return data as AdminTimeEntry;
}

export async function punchAdminVoidForRedo(id: string, reason: string): Promise<AdminTimeEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_admin_void_for_redo", {
    _id: id,
    _reason: reason,
  });
  if (error) throw error;
  return data as AdminTimeEntry;
}

export async function punchPaidLeaveCreate(
  payload: { company_id: string; user_id: string; date: string; minutes: number; notes?: string | null },
  reason: string,
): Promise<AdminTimeEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_paid_leave_create", {
    _payload: payload,
    _reason: reason,
  });
  if (error) throw error;
  return data as AdminTimeEntry;
}

export async function punchAuditList(timeEntryId: string): Promise<PunchAuditRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_audit_list", {
    _time_entry_id: timeEntryId,
  });
  if (error) throw error;
  return (data ?? []) as PunchAuditRow[];
}

/** datetime-local input <-> ISO. The input gives local naive datetime; we treat it as local TZ. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

export const ORIGIN_LABEL: Record<PunchOrigin, string> = {
  employee_punch: "Funcionário",
  manager_manual: "Manual (gestor)",
  manager_correction: "Corrigido",
  manager_voided: "Anulado",
  manual_adjustment: "Regularização manual",
  paid_leave: "Folga remunerada",
  vacation: "Férias aprovadas",
};

export const ORIGIN_TONE: Record<PunchOrigin, string> = {
  employee_punch: "bg-muted text-muted-foreground",
  manager_manual: "bg-warning/15 text-warning-foreground",
  manager_correction: "bg-info/15 text-info",
  manager_voided: "bg-destructive/15 text-destructive",
  manual_adjustment: "bg-warning/15 text-warning-foreground",
  paid_leave: "bg-success/15 text-success",
  vacation: "bg-success/15 text-success",
};

export type OperationalPunchRow = AdminTimeEntry & {
  record_kind?: "work" | "paid_leave" | "absence" | "task" | "vacation";
  absence_reason?: string | null;
  absence_justified?: boolean | null;
  absence_source?: string | null;
  absence_origin?: "employee" | "manager" | "automatic" | string | null;
  task_status?: string | null;
  operational_status?: "trabalhado" | "em_andamento" | "atrasada" | "pendente" | "absence" | string | null;
  no_start_reason?: string | null;
  no_start_reason_at?: string | null;
  no_start_reason_by?: string | null;
  task_notes?: TaskOperationalNote[];
  tasks: {
    title: string;
    client_id: string | null;
    scheduled_for?: string | null;
    scheduled_end?: string | null;
    recurrence_date?: string | null;
    due_at?: string | null;
  } | null;
  profiles: { full_name: string | null } | null;
};

export type OperationalPunchFilters = {
  companyId: string;
  employeeId?: string | null;
  clientId?: string | null;
  taskSearch?: string | null;
  status?: "all" | "open" | "closed";
  fromTs?: string | null;
  toTs?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
  offset?: number;
};

/** Feed canónico da Folha de Ponto · Gestão: pontos reais + faltas por ocorrência. */
export async function listOperationalPunches(filters: OperationalPunchFilters) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("timesheet_operational_list", {
    _company_id: filters.companyId,
    _employee_id: filters.employeeId ?? null,
    _client_id: filters.clientId ?? null,
    _task_search: filters.taskSearch?.trim() || null,
    _status: filters.status ?? "all",
    _from_ts: filters.fromTs ?? null,
    _to_ts: filters.toTs ?? null,
    _from_date: filters.fromDate ?? null,
    _to_date: filters.toDate ?? null,
    _limit: filters.limit ?? 50,
    _offset: filters.offset ?? 0,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("A Folha de Ponto recebeu uma resposta inválida do servidor.");
  }
  const result = data as { rows?: OperationalPunchRow[]; total?: number };
  if (!Array.isArray(result.rows) || typeof result.total !== "number") {
    throw new Error("A Folha de Ponto recebeu dados incompletos do servidor.");
  }
  return { rows: await enrichOperationalTaskNotes(result.rows, filters.companyId), total: result.total };
}

/** Busca as notas de tarefas da página em lote, sem uma consulta por linha. */
async function enrichOperationalTaskNotes(rows: OperationalPunchRow[], companyId: string) {
  const taskIds = Array.from(new Set(rows.map((row) => row.task_id).filter((id): id is string => !!id)));
  if (taskIds.length === 0) return rows;

  const [tasksResult, eventsResult, refusalsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,status,assigned_to,cancellation_reason,cancelled_at,cancelled_by,refusal_reason,refused_at,refused_by")
      .eq("company_id", companyId)
      .in("id", taskIds),
    (supabase.from("task_audit_events" as never) as any)
      .select("task_id,event,reason,created_at")
      .eq("company_id", companyId)
      .in("task_id", taskIds)
      .in("event", ["completion_note", "cancel"]),
    (supabase.from("task_refusals" as never) as any)
      .select("id,company_id,task_id,employee_id,actor_id,reason,previous_status,new_status,created_at")
      .eq("company_id", companyId)
      .in("task_id", taskIds)
      .order("created_at", { ascending: false }),
  ]);

  // A coluna é complementar. Se o schema remoto ainda estiver em atualização,
  // preserve a folha principal em vez de transformar notas numa falha de tela.
  if (tasksResult.error || eventsResult.error || refusalsResult.error) {
    console.warn("Notas de tarefas não puderam ser carregadas:", tasksResult.error ?? eventsResult.error ?? refusalsResult.error);
    return rows;
  }

  const taskById = new Map<string, TaskNoteTaskSnapshot>(
    ((tasksResult.data ?? []) as TaskNoteTaskSnapshot[]).map((task) => [task.id!, task]),
  );

  // Campos de alteração de programação foram adicionados depois da estrutura
  // inicial. São opcionais para que um ambiente ainda não migrado continue
  // exibindo as observações e os motivos já disponíveis.
  const [taskScheduleResult, refusalScheduleResult] = await Promise.all([
    (supabase.from("tasks") as any)
      .select("id,schedule_change_requested_date,schedule_change_needs_reassignment")
      .eq("company_id", companyId)
      .in("id", taskIds),
    (supabase.from("task_refusals" as never) as any)
      .select("id,schedule_change_requested_date,schedule_change_needs_reassignment")
      .eq("company_id", companyId)
      .in("task_id", taskIds),
  ]);
  if (!taskScheduleResult.error) {
    for (const schedule of (taskScheduleResult.data ?? []) as Array<Pick<TaskNoteTaskSnapshot, "id" | "schedule_change_requested_date" | "schedule_change_needs_reassignment">>) {
      const task = taskById.get(schedule.id!);
      if (task) taskById.set(schedule.id!, { ...task, ...schedule });
    }
  }
  const scheduleByRefusalId = new Map<string, Pick<TaskRefusalRecord, "schedule_change_requested_date" | "schedule_change_needs_reassignment">>();
  if (!refusalScheduleResult.error) {
    for (const schedule of (refusalScheduleResult.data ?? []) as Array<TaskRefusalRecord & { id: string }>) {
      scheduleByRefusalId.set(schedule.id, schedule);
    }
  }
  const completionByTask = new Map<string, TaskCompletionNoteEvent[]>();
  const cancellationByTask = new Map<string, TaskCancellationNoteEvent[]>();
  for (const event of (eventsResult.data ?? []) as Array<TaskCompletionNoteEvent & { event: string }>) {
    const target = event.event === "completion_note" ? completionByTask : cancellationByTask;
    const taskEvents = target.get(event.task_id) ?? [];
    taskEvents.push(event);
    target.set(event.task_id, taskEvents);
  }
  const refusalsByTask = new Map<string, TaskRefusalRecord[]>();
  for (const refusal of (refusalsResult.data ?? []) as TaskRefusalRecord[]) {
    const taskRefusals = refusalsByTask.get(refusal.task_id) ?? [];
    taskRefusals.push({ ...refusal, ...scheduleByRefusalId.get(refusal.id) });
    refusalsByTask.set(refusal.task_id, taskRefusals);
  }

  return rows.map((row) => {
    if (!row.task_id) return row;
    const task = taskById.get(row.task_id) ?? {
      status: row.task_status ?? null,
      assigned_to: row.user_id,
    };
    const task_notes = resolveTaskOperationalNotes({
      task: { ...task, id: row.task_id },
      completionEvents: completionByTask.get(row.task_id),
      cancellationEvents: cancellationByTask.get(row.task_id),
      refusals: refusalsByTask.get(row.task_id),
    });
    return { ...row, task_notes };
  });
}
