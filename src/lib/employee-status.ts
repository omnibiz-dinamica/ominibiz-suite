export type EmployeeStatusFields = {
  is_active?: boolean | null;
  status?: string | null;
  termination_date?: string | null;
};

/** Espelha a regra canónica de public.company_active_member_options. */
export function isEmployeeActive(
  employee: EmployeeStatusFields | null | undefined,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (!employee) return false;
  if (employee.is_active === false) return false;
  if (employee.status?.trim().toLocaleLowerCase("pt-BR") === "inativo") return false;
  return !employee.termination_date || employee.termination_date > today;
}
/* ------------------------------------------------------------------ */
/* SUP-308 (18/11/2026) — saída do funcionário                        */
/* ------------------------------------------------------------------ */

/** Desativado à mão (Equipe) ou pela tarefa diária após o período de saída. */
export function isExplicitlyInactive(employee: EmployeeStatusFields | null | undefined): boolean {
  if (!employee) return true;
  if (employee.is_active === false) return true;
  return employee.status?.trim().toLocaleLowerCase("pt-BR") === "inativo";
}

export type EmployeeExitState = "ativo" | "sai_em" | "em_saida" | "inativo";

/**
 * ativo · sai_em (rescisão marcada no futuro) · em_saida (já saiu, ainda
 * visível para o fecho de contas) · inativo.
 */
export function employeeExitState(
  employee: EmployeeStatusFields | null | undefined,
  today = new Date().toISOString().slice(0, 10),
): EmployeeExitState {
  if (isExplicitlyInactive(employee)) return "inativo";
  const t = employee?.termination_date ?? null;
  if (!t) return "ativo";
  return t > today ? "sai_em" : "em_saida";
}

/** Último dia em que fica visível (data de saída + dias da empresa). */
export function exitVisibleUntil(terminationDate: string, graceDays: number): string {
  const d = new Date(`${terminationDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(graceDays)));
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_TERMINATION_GRACE_DAYS = 45;

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Texto curto da etiqueta, ou null quando não há saída marcada. */
export function exitBadgeLabel(
  employee: EmployeeStatusFields | null | undefined,
  graceDays = DEFAULT_TERMINATION_GRACE_DAYS,
  today = new Date().toISOString().slice(0, 10),
): string | null {
  const state = employeeExitState(employee, today);
  const t = employee?.termination_date;
  if (!t) return null;
  if (state === "sai_em") return `Sai em ${br(t)}`;
  if (state === "em_saida") return `Em saída · visível até ${br(exitVisibleUntil(t, graceDays))}`;
  return null;
}

/** Dias da empresa (company_hr_settings.termination_grace_days); 45 se não houver. */
export async function fetchTerminationGraceDays(companyId: string): Promise<number> {
  const { supabase } = await import("@/integrations/supabase/client");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("company_hr_settings") as any)
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return DEFAULT_TERMINATION_GRACE_DAYS;
  const v = Number((data as { termination_grace_days?: number } | null)?.termination_grace_days);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_TERMINATION_GRACE_DAYS;
}
