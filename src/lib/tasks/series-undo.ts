/**
 * 22/11/2026 — "Desfazer" a edição de uma série (até 24 h, só gestão).
 * O servidor (recurrence_edit_undo_apply) valida tudo: papel, prazo, uma só vez,
 * série não alterada depois e ocorrências não iniciadas. Aqui só se encontra
 * a cópia que corresponde a cada linha "Editou a recorrência" do Histórico.
 * Tolerante: sem a tabela (SQL ainda não aplicado) não aparece nenhum botão.
 */
import { supabase } from "@/integrations/supabase/client";

export type SeriesUndoSnapshot = {
  id: string;
  recurrence_id: string;
  created_at: string;
  expires_at: string;
  undone_at: string | null;
};

export type UndoableEvent = {
  action?: string | null;
  entity_id?: string | null;
  created_at: string;
};

/** Distância máxima entre a linha do Histórico e a cópia da mesma edição. */
const MATCH_WINDOW_MS = 10_000;

export function findUndoSnapshot(
  event: UndoableEvent,
  snapshots: SeriesUndoSnapshot[],
  now: number = Date.now(),
): SeriesUndoSnapshot | null {
  if (event.action !== "series_edited" || !event.entity_id) return null;
  const at = new Date(event.created_at).getTime();
  let best: SeriesUndoSnapshot | null = null;
  let bestDiff = Infinity;
  for (const s of snapshots) {
    if (s.recurrence_id !== event.entity_id || s.undone_at) continue;
    if (new Date(s.expires_at).getTime() <= now) continue;
    const diff = Math.abs(new Date(s.created_at).getTime() - at);
    if (diff <= MATCH_WINDOW_MS && diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

export async function fetchUndoableSeriesEdits(companyId: string): Promise<SeriesUndoSnapshot[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("recurrence_edit_undo" as never) as any)
      .select("id, recurrence_id, created_at, expires_at, undone_at")
      .eq("company_id", companyId)
      .is("undone_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return [];
    return (data ?? []) as SeriesUndoSnapshot[];
  } catch {
    return [];
  }
}

export async function applySeriesUndo(id: string): Promise<{ restored: number; reverted: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("recurrence_edit_undo_apply", { _id: id });
  if (error) throw error;
  const d = (data ?? {}) as { restored?: number; reverted?: number };
  return { restored: d.restored ?? 0, reverted: d.reverted ?? 0 };
}
