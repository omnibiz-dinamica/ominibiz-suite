import { supabase } from "@/integrations/supabase/client";
import type { TimeEntryRow } from "@/lib/tasks";

export type PunchOrigin = "employee_punch" | "manager_manual" | "manager_correction";

export interface AdminTimeEntry extends TimeEntryRow {
  origin: PunchOrigin;
  created_by: string | null;
  last_edited_by: string | null;
  last_edited_at: string | null;
  last_edit_reason: string | null;
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
  task_id: string;
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

export async function punchAdminUpdate(id: string, payload: PunchUpdatePayload, reason: string): Promise<AdminTimeEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_admin_update", {
    _id: id,
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
};

export const ORIGIN_TONE: Record<PunchOrigin, string> = {
  employee_punch: "bg-muted text-muted-foreground",
  manager_manual: "bg-warning/15 text-warning-foreground",
  manager_correction: "bg-info/15 text-info",
};