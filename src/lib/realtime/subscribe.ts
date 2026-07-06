import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * OmniBiz · Fase 4 — Infraestrutura Realtime unificada.
 *
 * Objetivo:
 *   Fornecer UMA única maneira, testada e auditável, de assinar mudanças
 *   Realtime da tabela do Supabase e reagir invalidando cache do React Query.
 *
 * Reuso previsto (Fase 5+):
 *   • RH · Tarefas · Férias · Despesas · Comercial · Frota · Recibos · Contratos
 *
 * Regras:
 *   1. Nunca subscrever fora de `useEffect` — evita reconexão a cada render
 *      (ver `cloud-realtime` no guia oficial).
 *   2. Nome de canal deve ser único por escopo (`table:filterHash`), para não
 *      colidir com outros subscribers do mesmo usuário.
 *   3. Sempre executar `supabase.removeChannel(channel)` no cleanup.
 *   4. O callback recebe o payload nativo — o consumidor decide como reagir
 *      (invalidate por padrão, mas pode transformar em otimização otimista).
 */

type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export type RealtimeSubscribeOptions = {
  /** Nome lógico (usado como prefixo do canal). Ex.: "notifications". */
  channel: string;
  /** Tabela `public.*`. */
  table: string;
  /** Evento(s) a escutar. Default: `*`. */
  event?: RealtimeEvent;
  /** Filtro postgres_changes (ex.: `user_id=eq.<uuid>`). */
  filter?: string;
  /** Schema. Default: `public`. */
  schema?: string;
  /** Callback com payload. */
  onChange: (payload: unknown) => void;
  /** Se falsy, não subscreve (ex.: `!!user`). */
  enabled?: boolean;
};

/**
 * Hook base: assina uma tabela e chama `onChange` a cada evento.
 * Retorna void — cleanup é automático via `useEffect`.
 */
export function useRealtimeSubscription({
  channel,
  table,
  event = "*",
  filter,
  schema = "public",
  onChange,
  enabled = true,
}: RealtimeSubscribeOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const suffix = filter ? `:${filter}` : "";
    const ch = supabase
      .channel(`${channel}:${table}${suffix}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event, schema, table, ...(filter ? { filter } : {}) },
        (payload: unknown) => onChange(payload),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // onChange intencionalmente omitido: consumidor garante estabilidade
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, table, event, filter, schema, enabled]);
}

/**
 * Atalho: invalida uma lista de queryKeys sempre que a tabela mudar.
 * Preferir esta versão a chamar `invalidateQueries` avulso no callback.
 */
export function useRealtimeInvalidate(params: {
  channel: string;
  table: string;
  event?: RealtimeEvent;
  filter?: string;
  schema?: string;
  enabled?: boolean;
  queryClient: QueryClient;
  /** Helper de invalidação (ex.: `invalidateNotificationsCache`). */
  invalidate: (qc: QueryClient) => void;
}): void {
  const { queryClient, invalidate, ...rest } = params;
  useRealtimeSubscription({
    ...rest,
    onChange: () => invalidate(queryClient),
  });
}