import type { QueryClient } from "@tanstack/react-query";

/**
 * Cache central do módulo Central de Suporte.
 * Ver docs/ARCHITECTURE_PRINCIPLES.md §Cache Helpers.
 */
export const SUPPORT_QUERY_PREFIXES = [
  ["support-tickets"],
  ["support-ticket"],
  ["support-ticket-messages"],
  ["support-ticket-events"],
  ["support-ticket-attachments"],
  ["support-metrics"],
] as const;

export function invalidateSupportCache(qc: QueryClient): void {
  for (const key of SUPPORT_QUERY_PREFIXES) {
    qc.invalidateQueries({ queryKey: key as readonly unknown[] });
  }
}

export function invalidateSupportTicket(qc: QueryClient, ticketId: string): void {
  qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
  qc.invalidateQueries({ queryKey: ["support-ticket-messages", ticketId] });
  qc.invalidateQueries({ queryKey: ["support-ticket-events", ticketId] });
  qc.invalidateQueries({ queryKey: ["support-ticket-attachments", ticketId] });
  qc.invalidateQueries({ queryKey: ["support-tickets"] });
  qc.invalidateQueries({ queryKey: ["support-metrics"] });
}