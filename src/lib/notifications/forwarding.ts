/**
 * SUP-161 (18/11/2026) — encaminhamento de notificações: etiquetas de cor por
 * destinatário (Contabilista verde, Léa rosa, Luc roxo) e filtro por pessoa
 * na aba "Em tratamento". O valor gravado continua a ser o texto livre de
 * forwarded_to; aqui só se normaliza para comparar e colorir.
 */
export const FORWARD_SUGGESTIONS = [
  "Contabilista",
  "Léa",
  "Luc",
  "Gestor",
  "Recursos Humanos",
  "Direção",
];

export function forwardKey(name: string | null | undefined): string {
  return (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

const TONES: Record<string, string> = {
  contabilista: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  lea: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  luc: "bg-purple-500/20 text-purple-700 dark:text-purple-300",
};

/** Cor da etiqueta do destinatário; null = cor normal de "Encaminhada". */
export function forwardTone(name: string | null | undefined): string | null {
  return TONES[forwardKey(name)] ?? null;
}

/** Destinatários presentes (para os botões de filtro), na ordem das sugestões e depois A–Z. */
export function forwardTargets(values: (string | null | undefined)[]): string[] {
  const byKey = new Map<string, string>();
  for (const v of values) {
    const k = forwardKey(v);
    if (k && !byKey.has(k)) byKey.set(k, (v ?? "").trim());
  }
  const order = FORWARD_SUGGESTIONS.map(forwardKey);
  return [...byKey.entries()]
    .sort(([a, la], [b, lb]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return la.localeCompare(lb, "pt");
    })
    .map(([, label]) => label);
}

export function matchesForwardFilter(
  forwardedTo: string | null | undefined,
  filter: string,
): boolean {
  return !filter || forwardKey(forwardedTo) === forwardKey(filter);
}
