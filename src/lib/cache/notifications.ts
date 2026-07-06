import type { QueryClient } from "@tanstack/react-query";

/**
 * Cache central do módulo Notificações (Fase 4).
 *
 * Regra oficial (Arquitetura, §Cache Helpers): nenhum módulo novo pode
 * chamar `qc.invalidateQueries` diretamente para tabelas cobertas por um
 * helper. Sempre use este helper para invalidar cache de notificações.
 */
export const NOTIFICATIONS_QUERY_PREFIXES = [
  ["notifications"],
  ["notifications-unread-count"],
] as const;

export function invalidateNotificationsCache(qc: QueryClient): void {
  for (const key of NOTIFICATIONS_QUERY_PREFIXES) {
    qc.invalidateQueries({ queryKey: key as readonly unknown[] });
  }
}

export async function invalidateNotificationsCacheAsync(
  qc: QueryClient,
): Promise<void> {
  await Promise.all(
    NOTIFICATIONS_QUERY_PREFIXES.map((key) =>
      qc.invalidateQueries({ queryKey: key as readonly unknown[] }),
    ),
  );
}