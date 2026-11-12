/**
 * Equipas e setores (ticket 172, 12/11/2026). Dois campos do cadastro:
 *  - Setor com nome (profiles.sector): COIFAS, HAPPYKOTS, DELIVA…
 *  - Número da equipa (profiles.team_number): 1–10.
 * A pesquisa encontra pelos dois e os atalhos selecionam o grupo inteiro.
 */
export type TeamMember = { id: string; sector?: string | null; team_number?: number | null };
export type TeamGroup = { key: string; name: string; kind: "sector" | "number"; ids: string[] };

export function teamKey(sector: string | null | undefined): string {
  return (sector ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Texto do número da equipa para mostrar e pesquisar ("Equipa 6"). */
export function teamNumberLabel(n: number | null | undefined): string | null {
  return n == null || !Number.isFinite(Number(n)) ? null : `Equipa ${Number(n)}`;
}

/** Setores existentes (alfabético) com as pessoas de cada um. */
export function sectorGroups(members: TeamMember[]): TeamGroup[] {
  const map = new Map<string, TeamGroup>();
  for (const m of members) {
    const k = teamKey(m.sector);
    if (!k) continue;
    const key = `s:${k}`;
    const g = map.get(key) ?? {
      key,
      name: (m.sector ?? "").trim().toUpperCase(),
      kind: "sector",
      ids: [],
    };
    g.ids.push(m.id);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** Equipas por número (1, 2, …) com as pessoas de cada uma. */
export function numberGroups(members: TeamMember[]): TeamGroup[] {
  const map = new Map<number, TeamGroup>();
  for (const m of members) {
    const n = m.team_number == null ? NaN : Number(m.team_number);
    if (!Number.isFinite(n)) continue;
    const g = map.get(n) ?? { key: `n:${n}`, name: `Equipa ${n}`, kind: "number", ids: [] };
    g.ids.push(m.id);
    map.set(n, g);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
}

/** Setores e depois equipas por número. */
export function teamGroups(members: TeamMember[]): TeamGroup[] {
  return [...sectorGroups(members), ...numberGroups(members)];
}

/** Seleciona o grupo todo; se já estava todo selecionado, tira-o. */
export function toggleTeam(selected: string[], team: TeamGroup): string[] {
  const all = team.ids.every((id) => selected.includes(id));
  if (all) return selected.filter((id) => !team.ids.includes(id));
  return [...new Set([...selected, ...team.ids])];
}
