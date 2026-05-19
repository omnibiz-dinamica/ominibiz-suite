import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Pause, Play, Square, Coffee, Clock as ClockIcon, AlertCircle, Flame, Plus, Building2, ShieldAlert, Send } from "lucide-react";
import {
  type TimeEntryRow,
  type TaskRow,
  punchPause,
  punchResume,
  punchState,
  effectiveMinutesNow,
  formatDuration,
  transitionTask,
  requestTaskAuthorization,
  STATUS_LABELS,
  STATUS_TONE,
  isVisuallyLate,
} from "@/lib/tasks";

export const Route = createFileRoute("/app/ponto")({ component: PontoPage });

const PRIORITY_TONE: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/15 text-info",
  alta: "bg-warning/15 text-warning-foreground",
  urgente: "bg-destructive/15 text-destructive",
};

function PontoPage() {
  const { user, isManager, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [, setNow] = useState(() => Date.now());

  // Tick visual (1s) — apenas para renderização.
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

  // Próximas tarefas do dia (quando não há ponto aberto)
  const { data: upcoming } = useQuery({
    queryKey: ["punch-upcoming", user?.id, isManager, currentCompanyId],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from("tasks")
        .select("*")
        .in("status", ["pendente", "autorizado", "ausente"])
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .limit(12);
      // Gestor/super admin: vê tarefas da empresa (toda a operação).
      // Funcionário: vê apenas as suas.
      if (isManager) {
        if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      } else {
        q = q.eq("assigned_to", user.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
    enabled: !!user && !openEntry,
  });

  // Mapa de clientes da empresa para exibir nome
  const { data: clientsMap } = useQuery({
    queryKey: ["clients-map", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return {} as Record<string, string>;
      const { data, error } = await (supabase.from("clients" as never) as never as ReturnType<typeof supabase.from>)
        .select("id,name")
        .eq("company_id", currentCompanyId);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as unknown as { id: string; name: string }[]) map[r.id] = r.name;
      return map;
    },
    enabled: !!currentCompanyId,
  });

  // Histórico recente
  const { data: history } = useQuery({
    queryKey: ["punch-history", user?.id, isManager, currentCompanyId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase.from("time_entries" as any) as any)
        .select("*, tasks(title)")
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(15);
      if (!isManager) q = q.eq("user_id", user!.id);
      else if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (TimeEntryRow & { tasks: { title: string } | null })[];
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
          qc.invalidateQueries({ queryKey: ["punch-upcoming"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          qc.invalidateQueries({ queryKey: ["punch-upcoming"] });
          qc.invalidateQueries({ queryKey: ["punch-open-task"] });
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
      qc.invalidateQueries({ queryKey: ["punch-upcoming"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const startMut = useMutation({
    mutationFn: (taskId: string) => transitionTask(taskId, "iniciar"),
    onSuccess: () => {
      toast.success("Tarefa iniciada — ponto aberto");
      qc.invalidateQueries({ queryKey: ["punch-open"] });
      qc.invalidateQueries({ queryKey: ["punch-upcoming"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const requestAuthMut = useMutation({
    mutationFn: (taskId: string) => requestTaskAuthorization(taskId),
    onSuccess: () => {
      toast.success("Solicitação enviada ao gestor");
      qc.invalidateQueries({ queryKey: ["punch-upcoming"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const state = openEntry ? punchState(openEntry) : "encerrado";
  const liveMin = openEntry ? effectiveMinutesNow(openEntry) : 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Folha de Ponto</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua central operacional do dia. Inicie, pause e conclua tarefas em um clique.
          </p>
        </div>
        {isManager && (
          <Button asChild size="sm" className="shrink-0">
            <Link to="/app/tarefas">
              <Plus className="mr-1 h-4 w-4" /> Nova tarefa
            </Link>
          </Button>
        )}
      </div>

      {/* === CENTRAL OPERACIONAL === */}
      {openEntry && openTask ? (
        <ActiveTaskCard
          entry={openEntry}
          task={openTask}
          clientName={openTask.client_id ? clientsMap?.[openTask.client_id] : undefined}
          liveMin={liveMin}
          state={state}
          onPause={() => pauseMut.mutate()}
          onResume={() => resumeMut.mutate()}
          onComplete={() => endMut.mutate()}
          pausing={pauseMut.isPending}
          resuming={resumeMut.isPending}
          ending={endMut.isPending}
        />
      ) : (
        <UpcomingTasks
          tasks={upcoming ?? []}
          clientsMap={clientsMap ?? {}}
          isManager={isManager}
          onStart={(id) => startMut.mutate(id)}
          starting={startMut.isPending}
          startingId={startMut.variables ?? null}
          onRequestAuth={(id) => requestAuthMut.mutate(id)}
          requestingAuth={requestAuthMut.isPending}
          requestingAuthId={requestAuthMut.variables ?? null}
        />
      )}

      {/* === HISTÓRICO === */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3 text-sm font-medium">
          {isManager ? "Histórico recente da equipe" : "Seu histórico recente"}
        </div>
        {(history ?? []).length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Sem registros encerrados ainda.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(history ?? []).map((h) => (
              <li key={h.id} className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm">
                <div className="col-span-7 min-w-0">
                  <div className="truncate font-medium">{h.tasks?.title ?? "Tarefa"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(h.started_at).toLocaleString()} → {h.ended_at ? new Date(h.ended_at).toLocaleTimeString() : "—"}
                  </div>
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  {h.paused_at ? "c/ pausa" : "s/ pausa"}
                </div>
                <div className="col-span-3 text-right font-mono text-sm">
                  {formatDuration(h.effective_minutes ?? 0)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActiveTaskCard({
  entry,
  task,
  clientName,
  liveMin,
  state,
  onPause,
  onResume,
  onComplete,
  pausing,
  resuming,
  ending,
}: {
  entry: TimeEntryRow;
  task: TaskRow;
  clientName?: string;
  liveMin: number;
  state: "aberto" | "pausado" | "encerrado";
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  pausing: boolean;
  resuming: boolean;
  ending: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-lg">
      <div className="border-b border-border/60 px-5 py-3 text-xs font-medium uppercase tracking-wide text-primary">
        Tarefa em andamento
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{task.title}</h2>
          {clientName && (
            <div className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> {clientName}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[task.status]}`}>
              {STATUS_LABELS[task.status]}
            </span>
            {task.scheduled_for && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ClockIcon className="h-3 w-3" />
                {new Date(task.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              iniciado às {new Date(entry.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        {/* Cronômetro */}
        <div className="flex flex-col items-center justify-center rounded-xl bg-background/60 py-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Tempo efetivo</div>
          <div className="font-display text-5xl font-semibold tabular-nums sm:text-6xl">
            {formatDuration(liveMin)}
          </div>
          {state === "pausado" && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning-foreground">
              <Coffee className="h-3 w-3" /> Em pausa
            </div>
          )}
        </div>

        {/* Ações grandes */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {state === "aberto" && (
            <Button size="lg" variant="outline" className="h-14 text-base" disabled={pausing} onClick={onPause}>
              <Pause className="mr-2 h-5 w-5" /> Pausa almoço
            </Button>
          )}
          {state === "pausado" && (
            <Button size="lg" variant="outline" className="h-14 text-base" disabled={resuming} onClick={onResume}>
              <Play className="mr-2 h-5 w-5" /> Retorno almoço
            </Button>
          )}
          <Button
            size="lg"
            className="h-14 text-base sm:col-span-1"
            disabled={ending}
            onClick={onComplete}
          >
            <Square className="mr-2 h-5 w-5" /> Concluir tarefa
          </Button>
        </div>
      </div>
    </section>
  );
}

function UpcomingTasks({
  tasks,
  clientsMap,
  isManager,
  onStart,
  starting,
  startingId,
}: {
  tasks: TaskRow[];
  clientsMap: Record<string, string>;
  isManager: boolean;
  onStart: (id: string) => void;
  starting: boolean;
  startingId: string | null;
}) {
  if (tasks.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <ClockIcon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold">Sem tarefas pendentes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isManager
            ? "Nenhuma tarefa pendente na empresa. Crie uma nova para começar a operação."
            : "Você está livre. Quando uma nova tarefa for atribuída, ela aparecerá aqui."}
        </p>
        {isManager && (
          <Button asChild size="lg" className="mt-5">
            <Link to="/app/tarefas">
              <Plus className="mr-2 h-5 w-5" /> Criar nova tarefa
            </Link>
          </Button>
        )}
      </section>
    );
  }

  // Próxima tarefa pronta para iniciar (autorizada). Caso não exista,
  // destacamos a primeira da lista (pendente, aguardando autorização)
  // para dar contexto operacional imediato.
  const nextStartable = tasks.find((t) => t.status === "autorizado") ?? tasks[0];
  const rest = tasks.filter((t) => t.id !== nextStartable.id);
  const nextIsStartable = nextStartable.status === "autorizado";
  const nextStarting = starting && startingId === nextStartable.id;
  const nextLate = isVisuallyLate(nextStartable);
  const nextClient = nextStartable.client_id ? clientsMap[nextStartable.client_id] : undefined;

  return (
    <div className="space-y-4">
      {/* HERO — próxima tarefa do funcionário, ação imediata */}
      <section className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-primary">
            Próxima tarefa
          </span>
          {nextStartable.scheduled_for && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ClockIcon className="h-3 w-3" />
              {new Date(nextStartable.scheduled_for).toLocaleString([], {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_TONE[nextStartable.priority] ?? PRIORITY_TONE.media}`}>
                {nextStartable.priority === "urgente" && <Flame className="mr-1 h-3 w-3" />}
                {nextStartable.priority}
              </span>
              <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE[nextStartable.status]}`}>
                {STATUS_LABELS[nextStartable.status]}
              </span>
              {nextLate && (
                <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                  <AlertCircle className="h-3 w-3" /> atrasada
                </span>
              )}
            </div>
            <h2 className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">
              {nextStartable.title}
            </h2>
            {nextClient && (
              <div className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> {nextClient}
              </div>
            )}
            {nextStartable.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {nextStartable.description}
              </p>
            )}
          </div>

          <Button
            size="lg"
            className="h-16 w-full text-base"
            disabled={!nextIsStartable || nextStarting}
            onClick={() => onStart(nextStartable.id)}
            title={!nextIsStartable ? "Aguardando autorização do gestor" : undefined}
          >
            <Play className="mr-2 h-6 w-6" />
            {nextIsStartable ? "Iniciar tarefa" : "Aguardando autorização"}
          </Button>
        </div>
      </section>

      {rest.length > 0 && (
        <section className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="text-sm font-medium">Depois</div>
        <div className="text-xs text-muted-foreground">{rest.length} na fila</div>
      </div>
      <ul className="divide-y divide-border">
        {rest.map((t) => {
          const late = isVisuallyLate(t);
          const isStarting = starting && startingId === t.id;
          const clientName = t.client_id ? clientsMap[t.client_id] : undefined;
          return (
            <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_TONE[t.priority] ?? PRIORITY_TONE.media}`}>
                    {t.priority}
                  </span>
                  {late && (
                    <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                      <AlertCircle className="h-3 w-3" /> atrasada
                    </span>
                  )}
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                </div>
                <div className="mt-1 truncate font-medium">{t.title}</div>
                {clientName && (
                  <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" /> {clientName}
                  </div>
                )}
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t.scheduled_for
                    ? new Date(t.scheduled_for).toLocaleString([], {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "sem horário"}
                </div>
              </div>
              <Button
                size="lg"
                className="h-12 w-full sm:w-auto"
                disabled={t.status === "pendente" || isStarting}
                onClick={() => onStart(t.id)}
                title={t.status === "pendente" ? "Aguardando autorização do gestor" : undefined}
              >
                <Play className="mr-2 h-5 w-5" />
                {t.status === "pendente" ? "Aguardando autorização" : "Iniciar"}
              </Button>
            </li>
          );
        })}
      </ul>
        </section>
      )}
    </div>
  );
}