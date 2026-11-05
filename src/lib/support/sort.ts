import type { SupportTicketPriority } from "./constants";
import { PRIORITY_ORDER } from "./constants";

/** Ordenação da lista de tickets (Central de Suporte e Central Global). */
export type SupportSortOrder = "recent" | "priority_desc" | "priority_asc";

export const SUPPORT_SORT_OPTIONS: { value: SupportSortOrder; label: string }[] = [
  { value: "recent", label: "Mais recentes" },
  { value: "priority_desc", label: "Prioridade: Urgente → Baixa" },
  { value: "priority_asc", label: "Prioridade: Baixa → Urgente" },
];

const isSortOrder = (v: unknown): v is SupportSortOrder =>
  v === "recent" || v === "priority_desc" || v === "priority_asc";

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
    const byPriority = order === "priority_desc" ? weight(a) - weight(b) : weight(b) - weight(a);
    if (byPriority !== 0) return byPriority;
    return time(a) - time(b);
  });
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
