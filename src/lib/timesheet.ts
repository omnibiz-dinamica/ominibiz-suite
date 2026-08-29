import { supabase } from "@/integrations/supabase/client";
import { formatWallTime } from "@/lib/wall-clock";

/**
 * OmniBiz · Fechamento Mensal da Folha de Ponto (ADR-038).
 *
 * Porta de entrada ÚNICA do frontend. Regras invioláveis:
 *  1. Nenhum cálculo financeiro aqui — os valores vêm do snapshot construído
 *     no banco a partir de `time_entry_valuations` (fonte canónica, ADR-031).
 *  2. Gerar/assinar relatório NUNCA escreve em `time_entries`.
 *  3. Uma versão assinada é imutável; correção posterior cria versão N+1.
 */

export type TimesheetStatus =
  | "em_aberto"
  | "aguardando_funcionario"
  | "aguardando_correcao"
  | "assinado_funcionario"
  | "em_conferencia"
  | "fechado_gestor"
  | "disponivel_contabilidade";

export const TIMESHEET_STATUS_LABEL: Record<TimesheetStatus, string> = {
  em_aberto: "Em aberto",
  aguardando_funcionario: "Aguardando conferência",
  aguardando_correcao: "Aguardando correção",
  assinado_funcionario: "Assinado pelo funcionário",
  em_conferencia: "Em conferência",
  fechado_gestor: "Fechado pelo gestor",
  disponivel_contabilidade: "Disponível para contabilidade",
};

export const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function monthLabel(month: number, year: number) {
  return `${MONTH_LABELS[Math.min(Math.max(month, 1), 12) - 1]}/${year}`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDayTime(iso: string | null | undefined): string {
  return iso ? formatWallTime(iso) : "—";
}

export type SnapshotDay = {
  work_date: string;
  first_in: string | null;
  last_out: string | null;
  worked_minutes: number;
  break_minutes: number;
  entries_count: number;
  confirmed_at: string | null;
  day_type?: "work" | "vacation";
  vacation_status?: "aprovado" | null;
  /** Faltas ficam vinculadas às ocorrências, sem transformar o dia em ausência total. */
  absence_task_count?: number;
  absence_tasks?: {
    task_id: string;
    title: string;
    client_id: string | null;
    work_date: string;
  }[];
  attendance_status?: "work" | "vacation" | "absence" | "mixed" | "vacation_absence";
};

export type TimesheetSnapshot = {
  company: { id: string; name: string | null };
  employee: {
    id: string;
    full_name: string | null;
    job_title: string | null;
    work_location: string | null;
    team: string | null;
    signature_url: string | null;
    initials_url: string | null;
  };
  period: { year: number; month: number };
  days: SnapshotDay[];
  summary: {
    worked_minutes: number;
    paid_days: number;
    payment_type_used: string | null;
    rate_used: number | null;
    rate_source: string | null;
    calculated_amount: number | null;
    monthly_amount: number | null;
    currency: string;
  };
  generated_at: string;
};

export type TimesheetPeriod = {
  id: string;
  company_id: string;
  employee_id: string;
  period_year: number;
  period_month: number;
  status: TimesheetStatus;
  current_version: number;
  worked_minutes: number | null;
  paid_days: number | null;
  payment_type_used: string | null;
  rate_used: number | null;
  rate_source: string | null;
  monthly_amount: number | null;
  calculated_amount: number | null;
  currency: string;
  signed_at: string | null;
  closed_at: string | null;
  released_at: string | null;
  correction_requested_at: string | null;
  correction_reason: string | null;
};

export type TimesheetListRow = {
  period_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_email: string | null;
  job_title: string | null;
  payment_type: string | null;
  worked_minutes: number | null;
  paid_days: number | null;
  calculated_amount: number | null;
  currency: string;
  status: TimesheetStatus;
  signed_at: string | null;
  closed_at: string | null;
  released_at: string | null;
  current_version: number;
  pdf_path: string | null;
  has_signature: boolean;
};

const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(name, args);

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function buildSnapshot(params: {
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
}): Promise<TimesheetSnapshot> {
  return call<TimesheetSnapshot>("timesheet_build_snapshot", {
    _company_id: params.companyId,
    _employee_id: params.employeeId,
    _year: params.year,
    _month: params.month,
  });
}

export async function ensurePeriod(params: {
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
}): Promise<TimesheetPeriod> {
  const data = await call<TimesheetPeriod | TimesheetPeriod[]>("timesheet_period_ensure", {
    _company_id: params.companyId,
    _employee_id: params.employeeId,
    _year: params.year,
    _month: params.month,
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function confirmDay(companyId: string, workDate: string, confirm = true) {
  await call<void>("timesheet_day_confirm", {
    _company_id: companyId,
    _work_date: workDate,
    _confirm: confirm,
  });
}

export type TimesheetVersion = {
  id: string;
  period_id: string;
  company_id: string;
  employee_id: string;
  version: number;
  snapshot: TimesheetSnapshot;
  pdf_path: string | null;
  content_hash: string | null;
  signed_at: string | null;
};

export async function signPeriod(periodId: string): Promise<TimesheetVersion> {
  const data = await call<TimesheetVersion | TimesheetVersion[]>("timesheet_sign", {
    _period_id: periodId,
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function registerPdf(versionId: string, pdfPath: string, contentHash: string) {
  await call<void>("timesheet_register_pdf", {
    _version_id: versionId,
    _pdf_path: pdfPath,
    _content_hash: contentHash,
  });
}

export async function requestCorrection(periodId: string, reason: string) {
  await call<void>("timesheet_request_correction", { _period_id: periodId, _reason: reason });
}

export async function closePeriod(periodId: string) {
  await call<void>("timesheet_manager_close", { _period_id: periodId });
}

export async function sendToAccounting(periodId: string) {
  await call<void>("timesheet_send_to_accounting", { _period_id: periodId });
}

export async function logAccess(periodId: string, event: "REPORT_VIEWED" | "REPORT_DOWNLOADED") {
  try {
    await call<void>("timesheet_log_access", { _period_id: periodId, _event: event });
  } catch {
    /* auditoria não deve bloquear a leitura */
  }
}

export async function listPeriods(companyId: string, year: number, month: number) {
  return call<TimesheetListRow[]>("timesheet_list", {
    _company_id: companyId,
    _year: year,
    _month: month,
  });
}

export async function openMonth(companyId: string, year: number, month: number) {
  return call<number>("timesheet_open_month", {
    _company_id: companyId,
    _year: year,
    _month: month,
  });
}

/** Períodos do próprio funcionário (RLS garante o escopo). */
export async function listMyPeriods(userId: string, year?: number) {
  let q = supabase
    .from("timesheet_periods")
    .select("*")
    .eq("employee_id", userId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  if (year) q = q.eq("period_year", year);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as TimesheetPeriod[];
}

export async function getVersion(periodId: string, version: number) {
  const { data, error } = await supabase
    .from("timesheet_period_versions")
    .select("*")
    .eq("period_id", periodId)
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as TimesheetVersion | null) ?? null;
}

/** Caminho canónico do PDF: company/employee/YYYY-MM/vN.pdf */
export function pdfPath(v: {
  company_id: string;
  employee_id: string;
  year: number;
  month: number;
  version: number;
}) {
  return `${v.company_id}/${v.employee_id}/${v.year}-${String(v.month).padStart(2, "0")}/v${v.version}.pdf`;
}

export async function uploadTimesheetPdf(path: string, bytes: Uint8Array | Blob) {
  const { error } = await supabase.storage.from("timesheets").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function downloadTimesheetPdf(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from("timesheets").download(path);
  if (error || !data) throw error ?? new Error("Falha ao carregar o PDF");
  return data;
}

export async function signedTimesheetUrl(path: string, seconds = 300) {
  const { data, error } = await supabase.storage.from("timesheets").createSignedUrl(path, seconds);
  if (error || !data) throw error ?? new Error("Falha ao gerar link");
  return data.signedUrl;
}

/** SHA-256 hexadecimal do conteúdo (integridade do snapshot em PDF). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Assinatura/rubrica privada do funcionário como data URL (para embutir no PDF). */
export async function signatureDataUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from("employee-signatures").download(path);
    if (error || !data) return null;
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(data);
    });
  } catch {
    return null;
  }
}
