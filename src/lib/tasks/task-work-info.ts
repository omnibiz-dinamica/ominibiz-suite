/**
 * SUP-2026-000242 (15/11/2026) — o que o funcionário vê na tarefa antes e
 * durante o trabalho: anexos da tarefa e colegas que fazem a mesma tarefa.
 * A morada do cliente já vem do cadastro (ClientAddressBlock).
 *
 * Anexos: task_documents (RLS: só das tarefas atribuídas ao próprio).
 * Colegas: RPC my_task_colleagues (só nomes; só das próprias tarefas).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaskDocument } from "@/lib/tasks/task-documents";

export type TaskColleague = { id: string; name: string; status: string | null };

type ColleagueRow = {
  task_id: string;
  colleague_id: string;
  colleague_name: string | null;
  colleague_status: string | null;
};

/** Agrupa as linhas da RPC por tarefa, por ordem alfabética, sem repetir pessoas. */
export function groupColleagues(
  rows: ColleagueRow[] | null | undefined,
): Record<string, TaskColleague[]> {
  const out: Record<string, TaskColleague[]> = {};
  for (const r of rows ?? []) {
    const list = (out[r.task_id] ??= []);
    if (list.some((c) => c.id === r.colleague_id)) continue;
    list.push({
      id: r.colleague_id,
      name: (r.colleague_name ?? "").trim() || "Colega",
      status: r.colleague_status,
    });
  }
  for (const k of Object.keys(out))
    out[k].sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
  return out;
}

export function groupDocuments(
  docs: TaskDocument[] | null | undefined,
): Record<string, TaskDocument[]> {
  const out: Record<string, TaskDocument[]> = {};
  for (const d of docs ?? []) (out[d.task_id] ??= []).push(d);
  return out;
}

/** "Paula Renata e Dayane" / "Paula, Dayane e Ariana" */
export function colleaguesLabel(list: TaskColleague[]): string {
  const names = list.map((c) => c.name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Anexos e colegas de várias tarefas de uma vez (uma consulta de cada). */
export function useTaskWorkInfo(taskIds: string[]) {
  const ids = [...new Set(taskIds.filter(Boolean))].sort();
  const enabled = ids.length > 0;

  const docs = useQuery({
    queryKey: ["task-work-docs", ids],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("task_documents" as any) as any)
        .select("*")
        .in("task_id", ids)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return groupDocuments((data ?? []) as TaskDocument[]);
    },
  });

  const colleagues = useQuery({
    queryKey: ["task-work-colleagues", ids],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("my_task_colleagues", { _task_ids: ids });
      // Sem a função no banco (ainda não aplicada) a informação fica só indisponível.
      if (error) return {} as Record<string, TaskColleague[]>;
      return groupColleagues((data ?? []) as ColleagueRow[]);
    },
  });

  return {
    docsByTask: docs.data ?? ({} as Record<string, TaskDocument[]>),
    colleaguesByTask: colleagues.data ?? ({} as Record<string, TaskColleague[]>),
  };
}
