/**
 * SUP-337 (19/11/2026) — pesquisa de tickets também por pessoa (quem abriu).
 * Sem acentos e sem maiúsculas: "pianda" encontra "Piandá". Várias palavras
 * têm de aparecer todas (ex.: "pianda ponto" = tickets da Pianda sobre ponto).
 */
export function normalizeSearch(v: string | null | undefined): string {
  return (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function ticketMatchesSearch(fields: (string | null | undefined)[], query: string): boolean {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fields.map(normalizeSearch).join(" \u0001 ");
  return terms.every((t) => haystack.includes(t));
}
