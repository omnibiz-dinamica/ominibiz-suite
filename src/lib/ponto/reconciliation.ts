/**
 * Conferência Previsto x Real do ponto (Gestão, Fechamento e Contabilidade).
 *
 * Regras (dono, 09/11/2026):
 *  - Duração real igual à prevista (mesmo com horário deslocado) = sem ação.
 *  - Validar = conta o real.  Ignorar = conta o previsto (o ponto real fica igual).
 *  - Falta (sem ponto): Ignorar = só ciência, conta 0 h; ou Lançar ponto.
 *  - Ponto sem previsto: só Validar ou Alterar.
 *  - Folha assinada/fechada: Ignorar (e desfazer um Ignorar) bloqueado no banco.
 * As regras e as permissões são verificadas no banco
 * (timesheet_reconciliation_list / timesheet_reconciliation_decide).
 */
import { supabase } from "@/integrations/supabase/client";

export type ReconciliationStatus = "ok" | "pendente" | "validated" | "ignored" | "aberto";
export type ReconciliationAction = "validate" | "ignore" | "edit" | "launch" | "reset";
export type ReconciliationKind = "task" | "missing" | "unplanned_task" | "unplanned";
export type ReconciliationDecision = "validated" | "ignored" | "reset";

export interface ReconciliationRow {
  row_key: string;
  kind: ReconciliationKind;
  work_date: string;
  task_id: string | null;
  time_entry_id: string | null;
  task_title: string | null;
  task_status: string | null;
  client_name: string | null;
  planned_start: string | null;
  planned_end: string | null;
  planned_minutes: number | null;
  scheduled_for: string | null;
  scheduled_end: string | null;
  real_start: string | null;
  real_end: string | null;
  real_minutes: number;
  entries_count: number;
  diff_minutes: number | null;
  counted_minutes: number;
  status: ReconciliationStatus;
  decision: "validated" | "ignored" | null;
  decision_stale: boolean;
  decided_by_name: string | null;
  decided_at: string | null;
  notes: string | null;
  /** SUP-299 (15/11/2026): observação que o funcionário deixou na tarefa. */
  employee_note?: string | null;
  /** Desvio da entrada / saída face ao previsto, em minutos (+ depois, − antes). */
  start_shift_minutes?: number | null;
  end_shift_minutes?: number | null;
  /** Entrada ou saída a 15 min ou mais do previsto: linha em vermelho. */
  shift_alert?: boolean;
  period_status: string | null;
  period_locked: boolean;
  actions: ReconciliationAction[];
}

export async function listReconciliation(params: {
  companyId: string;
  employeeId: string;
  from: string;
  to: string;
}): Promise<ReconciliationRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("timesheet_reconciliation_list", {
    _company_id: params.companyId,
    _employee_id: params.employeeId,
    _from: params.from,
    _to: params.to,
  });
  if (error) throw error;
  return (data ?? []) as ReconciliationRow[];
}

export async function decideReconciliation(params: {
  companyId: string;
  employeeId: string;
  row: Pick<ReconciliationRow, "task_id" | "time_entry_id">;
  decision: ReconciliationDecision;
  notes?: string | null;
}): Promise<ReconciliationRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("timesheet_reconciliation_decide", {
    _company_id: params.companyId,
    _employee_id: params.employeeId,
    _task_id: params.row.task_id,
    _time_entry_id: params.row.task_id ? null : params.row.time_entry_id,
    _decision: params.decision,
    _notes: params.notes?.trim() ? params.notes.trim() : null,
  });
  if (error) throw error;
  return (data ?? null) as ReconciliationRow | null;
}

/** "+1:00", "-2:00", "0:00"; vazio quando não há valor. */
export function formatDiff(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** "2:00" (sem sinal). */
export function formatHours(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const abs = Math.max(0, Math.round(minutes));
  return `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

export function statusLabel(
  row: Pick<ReconciliationRow, "status" | "kind"> & { diff_minutes?: number | null },
): string {
  switch (row.status) {
    case "ok":
      // SUP-299: até 30 min de diferença (e horários a menos de 15 min) não pede decisão.
      return row.diff_minutes ? "Dentro da tolerância" : "Sem diferença";
    case "aberto":
      return "Ponto aberto";
    case "validated":
      return "Validado · conta o real";
    case "ignored":
      return row.kind === "missing" ? "Ciente · conta 0h" : "Ignorado · conta o previsto";
    default:
      return row.kind === "missing" ? "Sem ponto" : "Por conferir";
  }
}

export const ACTION_LABEL: Record<ReconciliationAction, string> = {
  validate: "Validar",
  ignore: "Ignorar",
  edit: "Corrigir",
  launch: "Lançar ponto",
  reset: "Desfazer",
};

export interface ReconciliationSummary {
  plannedMinutes: number;
  realMinutes: number;
  countedMinutes: number;
  balanceMinutes: number;
  pending: number;
  missing: number;
}

/** Totais do período (previsto, real, contado, saldo e pendências). */
export function summarizeReconciliation(rows: ReconciliationRow[]): ReconciliationSummary {
  let plannedMinutes = 0;
  let realMinutes = 0;
  let countedMinutes = 0;
  let pending = 0;
  let missing = 0;
  for (const r of rows) {
    plannedMinutes += r.planned_minutes ?? 0;
    realMinutes += r.real_minutes ?? 0;
    countedMinutes += r.counted_minutes ?? 0;
    if (r.status === "pendente") pending += 1;
    if (r.kind === "missing" && r.status === "pendente") missing += 1;
  }
  return {
    plannedMinutes,
    realMinutes,
    countedMinutes,
    balanceMinutes: realMinutes - plannedMinutes,
    pending,
    missing,
  };
}

/** Primeiro e último dia do mês (YYYY-MM-DD). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** "Entrada 20 min antes · saída 45 min depois" (só desvios de 15 min ou mais). */
export function shiftText(
  row: Pick<ReconciliationRow, "start_shift_minutes" | "end_shift_minutes">,
): string | null {
  const part = (label: string, m: number | null | undefined) => {
    if (m == null || Math.abs(m) < 15) return null;
    const abs = Math.abs(m);
    const t = abs >= 60 ? `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}` : `${abs} min`;
    return `${label} ${t} ${m < 0 ? "antes" : "depois"}`;
  };
  const out = [part("Entrada", row.start_shift_minutes), part("saída", row.end_shift_minutes)].filter(Boolean);
  if (out.length === 0) return null;
  const txt = out.join(" · ");
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** Contexto mostrado no editor ao "Corrigir": previsto, desvio e observação do funcionário. */
export type CorrectionContext = {
  planned: string | null;
  plannedMinutes: number | null;
  shift: string | null;
  employeeNote: string | null;
};

export function correctionContext(row: ReconciliationRow): CorrectionContext {
  return {
    planned: row.planned_start ? `${row.planned_start}–${row.planned_end ?? "?"}` : null,
    plannedMinutes: row.planned_minutes,
    shift: shiftText(row),
    employeeNote: row.employee_note?.trim() || null,
  };
}

/** Texto de confirmação antes de Ignorar. */
export function ignoreConfirmText(row: ReconciliationRow): string {
  if (row.kind === "missing") {
    return "Ignorar esta falta? Fica registado que a gestão viu e o dia conta 0 h. Se a pessoa trabalhou e esqueceu o ponto, use Lançar ponto.";
  }
  return `Ignorar a diferença (${formatDiff(row.diff_minutes)})? A folha passa a contar o previsto (${formatHours(row.planned_minutes)}) em vez do real (${formatHours(row.real_minutes)}). O ponto real não é apagado.`;
}
