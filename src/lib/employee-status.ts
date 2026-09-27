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