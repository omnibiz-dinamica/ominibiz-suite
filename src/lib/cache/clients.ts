import type { QueryClient } from "@tanstack/react-query";

/**
 * Central cache-invalidation helper for the `clients` domain.
 *
 * Fase 3 · Item 14 — resolve KI-002 unificando a invalidação de todos os
 * queryKeys que dependem da tabela `public.clients` (Clientes operacionais).
 *
 * Escopo intencional: NÃO invalida `commercial_clients` — é uma tabela
 * diferente do módulo Comercial (CRM), com seu próprio ciclo de cache.
 *
 * Uso obrigatório em toda mutation que altere `public.clients`
 * (create / update / delete / toggle status / geo / assignees).
 */
export const CLIENTS_QUERY_PREFIXES = [
  ["clients"],
  ["client-assignees"],
  ["clients-min"],
  ["clients-map"],
  ["wizard-clients"],
  ["punch-admin-clients-filter"],
] as const;

export function invalidateClientsCache(qc: QueryClient): void {
  for (const key of CLIENTS_QUERY_PREFIXES) {
    qc.invalidateQueries({ queryKey: key as readonly unknown[] });
  }
}

/**
 * Versão assíncrona: aguarda todas as invalidations concluírem antes de
 * resolver. Útil quando o chamador precisa garantir que a UI já refletiu
 * a alteração antes de fechar um dialog ou navegar.
 */
export async function invalidateClientsCacheAsync(qc: QueryClient): Promise<void> {
  await Promise.all(
    CLIENTS_QUERY_PREFIXES.map((key) =>
      qc.invalidateQueries({ queryKey: key as readonly unknown[] }),
    ),
  );
}