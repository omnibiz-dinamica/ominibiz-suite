/**
 * Equipas (ticket 172, 12/11/2026): a equipa de cada pessoa é o campo Setor do
 * cadastro (profiles.sector), com nome — COIFAS, HAPPYKOTS, DELIVA… Agrupa sem
 * diferenciar maiúsculas, acentos nem espaços a mais.
 */
export type TeamMember = { id: string; sector?: string | null };
export type TeamGroup = { key: string; name: string; ids: string[] };

export function teamKey(sector: string | null | undefined): string {
  return (sector ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Equipas existentes (por ordem alfabética) com as pessoas de cada uma. */
export function teamGroups(members: TeamMember[]): TeamGroup[] {
  const map = new Map<string, TeamGroup>();
  for (const m of members) {
    const key = teamKey(m.sector);
    if (!key) continue;
    const g = map.get(key) ?? { key, name: (m.sector ?? "").trim().toUpperCase(), ids: [] };
    g.ids.push(m.id);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** Seleciona a equipa toda; se já estava toda selecionada, tira-a. */
export function toggleTeam(selected: string[], team: TeamGroup): string[] {
  const all = team.ids.every((id) => selected.includes(id));
  if (all) return selected.filter((id) => !team.ids.includes(id));
  return [...new Set([...selected, ...team.ids])];
}
