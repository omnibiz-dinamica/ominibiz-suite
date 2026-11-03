/**
 * Ponto offline — leitura, para o gestor, de que pontos foram feitos sem rede
 * e com que atraso chegaram. Se a parte de banco ainda não existir, devolve
 * vazio (nunca parte o ecrã da Gestão de Ponto).
 */
import { supabase } from "@/integrations/supabase/client";

/** Acima disto (minutos entre a marcação e a chegada ao servidor) o gestor vê um aviso. */
export const OFFLINE_DELAY_WARNING_MINUTES = 60;

export interface OfflineEventRow {
  time_entry_id: string;
  op: "start" | "pause" | "resume" | "stop";
  captured_at: string;
  received_at: string;
  delay_minutes: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => supabase.from(name as never) as any;

/** Ids (desta página) dos pontos feitos sem rede. */
export async function fetchOfflineEntryIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await table("time_entries")
    .select("id")
    .in("id", ids)
    .eq("is_offline", true);
  if (error) return new Set(); // coluna ainda não criada -> sem selo
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

/** Marcações offline de um ponto, por ordem. */
export async function fetchOfflineEvents(entryId: string): Promise<OfflineEventRow[]> {
  const { data, error } = await table("time_entry_offline_events")
    .select("time_entry_id, op, captured_at, received_at, delay_minutes")
    .eq("time_entry_id", entryId)
    .order("captured_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as OfflineEventRow[];
}

export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Texto curto para o gestor: "Feito sem rede · enviado 2 h 5 min depois". */
export function offlineSummary(events: OfflineEventRow[]): { text: string; warn: boolean } | null {
  if (events.length === 0) return null;
  const maxDelay = Math.max(...events.map((e) => e.delay_minutes));
  return {
    text: `Feito sem rede · enviado ${formatDelay(maxDelay)} depois`,
    warn: maxDelay > OFFLINE_DELAY_WARNING_MINUTES,
  };
}
