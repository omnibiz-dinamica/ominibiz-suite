import { supabase } from "@/integrations/supabase/client";
import type { TimeEntryRow } from "@/lib/tasks";

export type PunchOrigin = "employee_punch" | "manager_manual" | "manager_correction" | "manager_voided" | "paid_leave";

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
  paid_leave: "Folga remunerada",
};

export const ORIGIN_TONE: Record<PunchOrigin, string> = {
  employee_punch: "bg-muted text-muted-foreground",
  manager_manual: "bg-warning/15 text-warning-foreground",
  manager_correction: "bg-info/15 text-info",
  manager_voided: "bg-destructive/15 text-destructive",
  paid_leave: "bg-success/15 text-success",
};

export type OperationalPunchRow = AdminTimeEntry & {
  record_kind?: "work" | "paid_leave" | "absence" | "task";
  absence_reason?: string | null;
  absence_justified?: boolean | null;
  absence_source?: string | null;
  absence_origin?: "employee" | "manager" | "automatic" | string | null;
  task_status?: string | null;
  operational_status?: "trabalhado" | "em_andamento" | "atrasada" | "pendente" | "absence" | string | null;
  no_start_reason?: string | null;
  no_start_reason_at?: string | null;
  no_start_reason_by?: string | null;
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
  const result = (data ?? {}) as { rows?: OperationalPunchRow[]; total?: number };
  return { rows: result.rows ?? [], total: result.total ?? 0 };
}
