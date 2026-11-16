/**
 * Tarefa recém-criada/alterada aparece na lista na hora (16/11/2026).
 *
 * A lista de tarefas lê TODAS as tarefas não arquivadas da empresa em páginas
 * de 1000 (milhares na V-clean). Depois de criar, o invalidate refazia essa
 * leitura inteira e a tarefa nova só aparecia no fim — às vezes parecia que
 * não tinha sido criada. Agora as tarefas acabadas de gravar são lidas pelos
 * seus ids (ou pela série, nas recorrências) e entram já no cache; a leitura
 * completa continua a correr em segundo plano e substitui tudo quando termina.
 *
 * As linhas vêm sempre do banco (RLS aplica-se); aqui só se junta à lista.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SavedTasksResult = {
  /** Tarefas gravadas diretamente (criação simples, lote por funcionário ou edição). */
  taskIds?: string[];
  /** Séries criadas/reaproveitadas cujas ocorrências foram geradas. */
  recurrenceIds?: string[];
};

type FreshTask = {
  id: string;
  company_id?: string | null;
  assigned_to?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  scheduled_for?: string | null;
  recurrence_date?: string | null;
  due_at?: string | null;
  created_at?: string | null;
};

/** Mesma ordem da consulta da lista (nulos no fim, ascendente). */
function compareNullableAsc(a?: string | null, b?: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareTaskListOrder(a: FreshTask, b: FreshTask): number {
  return (
    compareNullableAsc(a.scheduled_for, b.scheduled_for) ||
    compareNullableAsc(a.recurrence_date, b.recurrence_date) ||
    compareNullableAsc(a.due_at, b.due_at) ||
    compareNullableAsc(a.created_at, b.created_at)
  );
}

/**
 * Junta as tarefas frescas a uma lista em cache: substitui pelo id (nunca
 * duplica), respeita a vista (ativas × arquivadas), a empresa e — para quem
 * não é gestor — só as próprias tarefas. Devolve a lista original se nada muda.
 */
export function mergeFreshTasks<T extends FreshTask>(
  list: T[] | undefined,
  fresh: T[],
  scope: { companyId: string; userId?: string | null; isManager: boolean; view: string },
): T[] | undefined {
  if (!list) return list;
  const archivedView = scope.view === "archived";
  const belongs = (t: T) =>
    !t.deleted_at &&
    (t.company_id == null || t.company_id === scope.companyId) &&
    (archivedView ? !!t.archived_at : !t.archived_at) &&
    (scope.isManager || t.assigned_to === scope.userId);
  const freshById = new Map(fresh.map((t) => [t.id, t]));
  if (freshById.size === 0) return list;
  let changed = false;
  const out: T[] = [];
  for (const row of list) {
    const next = freshById.get(row.id);
    if (!next) {
      out.push(row);
      continue;
    }
    changed = true;
    freshById.delete(row.id);
    if (belongs(next)) out.push(next);
  }
  for (const row of freshById.values()) {
    if (!belongs(row)) continue;
    changed = true;
    out.push(row);
  }
  if (!changed) return list;
  return out.sort(compareTaskListOrder);
}

/** Lê do banco só as tarefas acabadas de gravar (máx. 1000 por pedido). */
export async function fetchSavedTasks<T extends FreshTask>(
  companyId: string,
  saved: SavedTasksResult,
): Promise<T[]> {
  const taskIds = [...new Set(saved.taskIds ?? [])].slice(0, 200);
  const recurrenceIds = [...new Set(saved.recurrenceIds ?? [])].slice(0, 50);
  const out: T[] = [];
  if (taskIds.length > 0) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("company_id", companyId)
      .in("id", taskIds);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as T[]));
  }
  if (recurrenceIds.length > 0) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("company_id", companyId)
      .in("recurrence_id", recurrenceIds)
      .is("deleted_at", null)
      .range(0, 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}

/**
 * Mostra as tarefas gravadas já e depois atualiza a lista inteira em segundo
 * plano. Se a leitura rápida falhar, fica só a atualização normal.
 */
export async function showSavedTasks(
  qc: QueryClient,
  companyId: string,
  saved: SavedTasksResult | undefined,
): Promise<void> {
  try {
    if (saved && ((saved.taskIds?.length ?? 0) > 0 || (saved.recurrenceIds?.length ?? 0) > 0)) {
      const fresh = await fetchSavedTasks(companyId, saved);
      if (fresh.length > 0) {
        // Cancela uma leitura completa em curso (com dados antigos) antes de escrever.
        await qc.cancelQueries({ queryKey: ["tasks", companyId] });
        for (const [key, old] of qc.getQueriesData<FreshTask[]>({
          queryKey: ["tasks", companyId],
        })) {
          const scope = scopeFromKey(key, companyId);
          if (!scope) continue;
          const next = mergeFreshTasks(old, fresh, scope);
          if (next !== old) qc.setQueryData(key, next);
        }
      }
    }
  } catch (e) {
    console.warn(
      "[tasks] leitura rápida das tarefas gravadas falhou; segue a atualização normal",
      e,
    );
  } finally {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  }
}

/** ["tasks", companyId, userId, isManager, view] */
function scopeFromKey(key: QueryKey, companyId: string) {
  if (!Array.isArray(key) || key[0] !== "tasks" || key[1] !== companyId) return null;
  return {
    companyId,
    userId: (key[2] as string | undefined) ?? null,
    isManager: key[3] === true,
    view: String(key[4] ?? ""),
  };
}

/**
 * Realtime → releitura agrupada. Cada INSERT/UPDATE em tasks disparava um
 * invalidate; o invalidate cancela a leitura em curso (7 páginas na V-clean) e
 * recomeça do zero. Uma recorrência que gera 52 ocorrências, ou a equipa a
 * bater ponto, reiniciava a leitura sem parar e a lista ficava parada.
 * Aqui os avisos juntam-se (espera `delayMs` sem novos avisos), nunca se cancela
 * uma leitura em curso — espera-se que termine — e no fim faz-se UMA releitura.
 */
export function createCoalescedRefresh(
  qc: QueryClient,
  queryKey: QueryKey,
  delayMs = 800,
): { trigger: () => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const run = () => {
    timer = null;
    if (disposed) return;
    if (qc.isFetching({ queryKey }) > 0) {
      timer = setTimeout(run, delayMs);
      return;
    }
    void qc.invalidateQueries({ queryKey });
  };
  return {
    trigger: () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
