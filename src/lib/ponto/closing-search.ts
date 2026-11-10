/**
 * Pesquisa do Fechamento Mensal (10/11/2026): por nome ou e-mail do funcionário,
 * sem diferenciar maiúsculas nem acentos. Só filtra o que já está na lista.
 */
const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function matchesClosingSearch(
  row: { employee_name: string | null; employee_email: string | null },
  term: string,
): boolean {
  const words = norm(term).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${norm(row.employee_name)} ${norm(row.employee_email)}`;
  return words.every((w) => hay.includes(w));
}
