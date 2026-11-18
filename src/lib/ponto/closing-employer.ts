/**
 * SUP-322 (18/11/2026) — Fechamento mensal: filtrar por empresa.
 * Na V-clean a empresa de cada funcionário (Life Tidy, Tokmagico, Letras
 * Modestas…) está no campo "Cargo / função" (profiles.job_title).
 */
const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export const NO_EMPLOYER = "__none__";

export function employerOptions(
  rows: { job_title?: string | null }[],
): { key: string; label: string; count: number }[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const k = norm(r.job_title) || NO_EMPLOYER;
    const cur = map.get(k);
    if (cur) cur.count += 1;
    else
      map.set(k, {
        label: k === NO_EMPLOYER ? "Sem empresa" : (r.job_title ?? "").trim(),
        count: 1,
      });
  }
  if (map.size === 1 && map.has(NO_EMPLOYER)) return [];
  return [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) =>
      a.key === NO_EMPLOYER ? 1 : b.key === NO_EMPLOYER ? -1 : a.label.localeCompare(b.label, "pt"),
    );
}

export function matchesEmployer(jobTitle: string | null | undefined, filter: string): boolean {
  if (!filter || filter === "all") return true;
  const k = norm(jobTitle) || NO_EMPLOYER;
  return k === filter;
}
