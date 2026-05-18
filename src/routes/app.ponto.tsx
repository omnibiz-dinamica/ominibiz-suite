import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Pause, Play, Square, Coffee } from "lucide-react";
import {
  type TimeEntryRow,
  type TaskRow,
  punchPause,
  punchResume,
  punchState,
  effectiveMinutesNow,
  formatDuration,
  transitionTask,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/lib/tasks";

export const Route = createFileRoute("/app/ponto")({ component: PontoPage });

function PontoPage() {
  const { user, isManager, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  // Tick visual (1s) — apenas para renderização do cronômetro. Não toca dados.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Ponto aberto do próprio usuário
  const { data: openEntry } = useQuery({
    queryKey: ["punch-open", user?.id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("time_entries" as any) as any)
        .select("*")
        .eq("user_id", user!.id)
        .is("ended_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TimeEntryRow | null;
    },
    enabled: !!user,
  });

  // Tarefa vinculada ao ponto aberto
  const { data: openTask } = useQuery({
    queryKey: ["punch-open-task", openEntry?.task_id],
    queryFn: async () => {
      if (!openEntry) return null;
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", openEntry.task_id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as TaskRow | null;
    },
    enabled: !!openEntry,
  });

  // Histórico recente do usuário (ou da empresa, se gestor)
  const { data: history } = useQuery({
    queryKey: ["punch-history", user?.id, isManager, currentCompanyId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase.from("time_entries" as any) as any)
        .select("*")
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(20);
      if (!isManager) q = q.eq("user_id", user!.id);
      else if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TimeEntryRow[];
    },
    enabled: !!user,
  });

  // Realtime: APENAS sincroniza UI.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("punch-ui-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries" },
        () => {
          qc.invalidateQueries({ queryKey: ["punch-open"] });
          qc.invalidateQueries({ queryKey: ["punch-open-task"] });
          qc.invalidateQueries({ queryKey: ["punch-history"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const pauseMut = useMutation({
    mutationFn: () => punchPause(),
    onSuccess: () => {
      toast.success("Pausa registrada");
      qc.invalidateQueries({ queryKey: ["punch-open"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resumeMut = useMutation({
    mutationFn: () => punchResume(),
    onSuccess: () => {
      toast.success("Retomado");
      qc.invalidateQueries({ queryKey: ["punch-open"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const endMut = useMutation({
    mutationFn: () => transitionTask(openTask!.id, "concluir"),
    onSuccess: () => {
      toast.success("Tarefa concluída e ponto encerrado");
      qc.invalidateQueries({ queryKey: ["punch-open"] });
      qc.invalidateQueries({ queryKey: ["punch-history"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const state = openEntry ? punchState(openEntry) : "encerrado";
  const liveMin = openEntry ? effectiveMinutesNow({ ...openEntry, ended_at: openEntry.ended_at }) : 0;
  // forçar dependência do tick
  void now;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Folha de Ponto</h1>
        <p className="mt-1 text-muted-foreground">
          Cada ponto é uma extensão operacional de uma tarefa. Inicie tarefas em <strong>Tarefas</strong>; o ponto abre automaticamente.
        </p>
      </div>

      {/* Card do ponto aberto */}
      <div className="rounded-2xl border border-border bg-card p-6">
        {!openEntry && (
          <div className="text-sm text-muted-foreground">
            Nenhum ponto aberto no momento. Vá em <strong>Tarefas</strong> e clique em <em>Iniciar</em> para abrir um.
          </div>
        )}
        {openEntry && openTask && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Tarefa em andamento</div>
                <div className="mt-1 text-lg font-semibold">{openTask.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[openTask.status]}`}>
                    {STATUS_LABELS[openTask.status]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    iniciado às {new Date(openEntry.started_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Tempo efetivo</div>
                <div className="font-display text-3xl font-semibold tabular-nums">{formatDuration(liveMin)}</div>
                {state === "pausado" && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-foreground">
                    <Coffee className="h-3 w-3" /> em pausa
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {state === "aberto" && (
                <Button variant="outline" disabled={pauseMut.isPending} onClick={() => pauseMut.mutate()}>
                  <Pause className="mr-2 h-4 w-4" /> Pausar (almoço)
                </Button>
              )}
              {state === "pausado" && (
                <Button variant="outline" disabled={resumeMut.isPending} onClick={() => resumeMut.mutate()}>
                  <Play className="mr-2 h-4 w-4" /> Retornar
                </Button>
              )}
              <Button
                variant="default"
                disabled={endMut.isPending}
                onClick={() => endMut.mutate()}
              >
                <Square className="mr-2 h-4 w-4" /> Concluir tarefa e encerrar ponto
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3 text-sm font-medium">
          {isManager ? "Histórico recente da empresa" : "Seus últimos registros"}
        </div>
        {(history ?? []).length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Sem registros encerrados ainda.</div>
        )}
        <ul className="divide-y divide-border">
          {(history ?? []).map((h) => (
            <li key={h.id} className="grid grid-cols-12 items-center gap-2 px-5 py-3 text-sm">
              <div className="col-span-6 truncate">
                <div className="font-medium">{new Date(h.started_at).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">
                  fim {h.ended_at ? new Date(h.ended_at).toLocaleTimeString() : "—"}
                </div>
              </div>
              <div className="col-span-3 text-xs text-muted-foreground">
                {h.paused_at ? "com pausa" : "sem pausa"}
              </div>
              <div className="col-span-3 text-right font-mono">
                {formatDuration(h.effective_minutes ?? 0)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}