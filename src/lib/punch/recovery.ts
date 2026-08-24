/**
 * OmniBiz — Recuperação de Ponto Aberto.
 *
 * Wrappers das RPCs canónicas:
 *   - punch_open_entry_self()          → ponto aberto do próprio funcionário
 *   - punch_open_entries_list(company) → pontos abertos da empresa (gestor/SA)
 *   - punch_recover_open_entry(...)    → encerramento auditado (funcionário ou gestor)
 *   - punch_open_entry_request_help()  → pedido de ajuda ao gestor
 *
 * A regra de um único ponto aberto (`uniq_open_punch_per_user`) permanece intacta.
 */
import { supabase } from "@/integrations/supabase/client";

export interface OpenEntrySelf {
  time_entry_id: string;
  task_id: string | null;
  task_title: string | null;
  task_status: string | null;
  client_name: string | null;
  company_id: string;
  company_name: string | null;
  started_at: string;
  paused_at: string | null;
  resumed_at: string | null;
  notes: string | null;
  origin: string;
  open_minutes: number;
}

export interface OpenEntryRow extends Omit<OpenEntrySelf, "resumed_at"> {
  user_id: string;
  user_name: string | null;
  severity: "normal" | "warning" | "critical";
  inconsistent: boolean;
}

export interface RecoveryResponse {
  success: boolean;
  code: string;
  message?: string | null;
  data?: Record<string, unknown> | null;
}

export const EMPLOYEE_REASONS: { value: string; label: string }[] = [
  { value: "esqueci_saida", label: "Esqueci de bater saída" },
  { value: "problema_sistema", label: "Problema no sistema" },
  { value: "sem_internet", label: "Sem internet" },
  { value: "app_nao_respondeu", label: "Aplicativo não respondeu" },
  { value: "outro", label: "Outro" },
];

export const MANAGER_REASONS: { value: string; label: string }[] = [
  { value: "esqueci_saida", label: "Funcionário esqueceu de bater saída" },
  { value: "falha_tecnica", label: "Falha técnica" },
  { value: "falha_internet", label: "Falha de internet" },
  { value: "dispositivo_indisponivel", label: "Dispositivo indisponível" },
  { value: "pedido_funcionario", label: "Correção solicitada pelo funcionário" },
  { value: "outro", label: "Outro" },
];

export function formatOpenDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}min`;
  return `${h}h ${String(rest).padStart(2, "0")}min`;
}

export function openMinutesFrom(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
}

export async function fetchOpenEntrySelf(): Promise<OpenEntrySelf | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_open_entry_self");
  if (error) throw error;
  return (data ?? null) as OpenEntrySelf | null;
}

export async function fetchOpenEntries(companyId?: string | null): Promise<OpenEntryRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_open_entries_list", {
    _company_id: companyId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as OpenEntryRow[];
}

export async function recoverOpenEntry(input: {
  timeEntryId: string;
  endedAtIso: string;
  reasonCode: string;
  reasonText?: string | null;
  completeTask?: boolean;
}): Promise<RecoveryResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_recover_open_entry", {
    _time_entry_id: input.timeEntryId,
    _ended_at: input.endedAtIso,
    _reason_code: input.reasonCode,
    _reason_text: input.reasonText ?? null,
    _complete_task: input.completeTask ?? false,
  });
  if (error) throw error;
  return (data ?? { success: false, code: "UNKNOWN" }) as RecoveryResponse;
}

export async function requestOpenEntryHelp(input: {
  timeEntryId: string;
  attemptedTaskId?: string | null;
  correlationId?: string | null;
}): Promise<RecoveryResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_open_entry_request_help", {
    _time_entry_id: input.timeEntryId,
    _attempted_task_id: input.attemptedTaskId ?? null,
    _correlation_id: input.correlationId ?? null,
  });
  if (error) throw error;
  return (data ?? { success: false, code: "UNKNOWN" }) as RecoveryResponse;
}

/** datetime-local (naive, fuso do dispositivo) → ISO */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SEVERITY_LABEL: Record<OpenEntryRow["severity"], string> = {
  normal: "Normal",
  warning: "Atenção",
  critical: "Crítico",
};

export const SEVERITY_TONE: Record<OpenEntryRow["severity"], string> = {
  normal: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning-foreground",
  critical: "bg-destructive/15 text-destructive",
};
