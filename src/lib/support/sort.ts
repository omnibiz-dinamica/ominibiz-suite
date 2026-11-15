import type { SupportTicketPriority } from "./constants";
import { PRIORITY_ORDER } from "./constants";

/** Ordenação da lista de tickets (Central de Suporte e Central Global). */
export type SupportSortOrder = "recent" | "oldest" | "priority_desc" | "priority_asc";

export const SUPPORT_SORT_OPTIONS: { value: SupportSortOrder; label: string }[] = [
  { value: "recent", label: "Data: mais recentes primeiro" },
  { value: "oldest", label: "Data: mais antigos primeiro" },
  // Dentro de cada prioridade: do mais antigo para o mais recente (15/11/2026).
  { value: "priority_desc", label: "Prioridade: Urgente → Baixa · data mais antiga → mais nova" },
  { value: "priority_asc", label: "Prioridade: Baixa → Urgente · data mais antiga → mais nova" },
];

const isSortOrder = (v: unknown): v is SupportSortOrder =>
  v === "recent" || v === "oldest" || v === "priority_desc" || v === "priority_asc";

type Sortable = { priority: SupportTicketPriority; created_at: string };

/**
 * Ordena sem alterar a lista original.
 * Mesma prioridade: o mais antigo primeiro (quem espera há mais tempo).
 */
export function sortSupportTickets<T extends Sortable>(tickets: T[], order: SupportSortOrder): T[] {
  const time = (t: Sortable) => new Date(t.created_at).getTime();
  const weight = (t: Sortable) => PRIORITY_ORDER[t.priority] ?? 99;
  return [...tickets].sort((a, b) => {
    if (order === "recent") return time(b) - time(a);
    if (order === "oldest") return time(a) - time(b);
    const byPriority = order === "priority_desc" ? weight(a) - weight(b) : weight(b) - weight(a);
    if (byPriority !== 0) return byPriority;
    return time(a) - time(b);
  });
}

/** Texto da linha "N tickets - ordenados por …". */
export function supportSortDescription(order: SupportSortOrder): string {
  if (order === "recent") return "data de abertura (mais recentes primeiro)";
  if (order === "oldest") return "data de abertura (mais antigos primeiro)";
  const p = order === "priority_desc" ? "urgente → baixa" : "baixa → urgente";
  return `prioridade (${p}) e, dentro de cada prioridade, da data mais antiga para a mais nova`;
}

/** A escolha fica no navegador de cada pessoa; sem acesso ao armazenamento volta a "Mais recentes". */
export function loadSupportSort(key: string): SupportSortOrder {
  try {
    if (typeof window === "undefined") return "recent";
    const v = window.localStorage.getItem(key);
    return isSortOrder(v) ? v : "recent";
  } catch {
    return "recent";
  }
}

export function saveSupportSort(key: string, value: SupportSortOrder) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível: a escolha vale só nesta visita */
  }
}

export const SUPPORT_SORT_KEY_COMPANY = "omnibiz:support:sort:company";
export const SUPPORT_SORT_KEY_GLOBAL = "omnibiz:support:sort:global";
