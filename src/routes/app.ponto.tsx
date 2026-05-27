import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Pause, Play, Square, Coffee, Clock as ClockIcon, AlertCircle, Flame, Plus, Building2, ShieldAlert, Send, LogIn, LogOut, Hand, Zap } from "lucide-react";
import { TaskDocuments } from "@/components/tasks/TaskDocuments";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type TimeEntryRow,
  type TaskRow,
  type PunchMode,
  punchPause,
  punchResume,
  punchState,
  effectiveSecondsNow,
  formatDuration,
  formatHMS,
  transitionTask,
  requestTaskAuthorization,
  punchManualStart,
  punchManualEnd,
  PUNCH_MODE_LABELS,
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
  const [modeChoice, setModeChoice] = useState<TaskRow | null>(null);

  // Tick visual (1s) — apenas para renderização.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Modo padrão da empresa (config de RH).
  const { data: companyMode } = useQuery({
    queryKey: ["hr-punch-mode", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return "automatico" as PunchMode;
      const { data, error } = await supabase
        .from("company_hr_settings")
        .select("default_punch_mode")
        .eq("company_id", currentCompanyId)
        .maybeSingle();
      if (error) throw error;
      return ((data?.default_punch_mode as PunchMode) ?? "automatico");
    },
    enabled: !!currentCompanyId,
  });

  const effectiveMode = (t: Pick<TaskRow, "punch_mode_override">): PunchMode =>
    (t.punch_mode_override as PunchMode | null | undefined) ?? companyMode ?? "automatico";

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
        .in("status", ["pendente", "autorizado", "ausente", "em_andamento"])
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
      const { data, error } = await (supabase.from("clients" as never) as any)
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
  const manualStartMut = useMutation({
    mutationFn: (taskId: string) => punchManualStart(taskId),
    onSuccess: () => {
      toast.success("Entrada registrada — contador iniciado");
      qc.invalidateQueries({ queryKey: ["punch-open"] });
      qc.invalidateQueries({ queryKey: ["punch-upcoming"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const manualEndMut = useMutation({
    mutationFn: (taskId: string) => punchManualEnd(taskId),
    onSuccess: () => {
      toast.success("Saída registrada — tarefa segue em andamento");
      qc.invalidateQueries({ queryKey: ["punch-open"] });
      qc.invalidateQueries({ queryKey: ["punch-upcoming"] });
      qc.invalidateQueries({ queryKey: ["punch-history"] });
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
  const liveSec = openEntry ? effectiveSecondsNow(openEntry) : 0;

  // Decide qual ação executar ao clicar em "Iniciar/Bater entrada".
  const handleStart = (t: TaskRow) => {
    const mode = effectiveMode(t);
    if (mode === "ambos") {
      setModeChoice(t);
      return;
    }
    if (mode === "manual") {
      manualStartMut.mutate(t.id);
      return;
    }
    startMut.mutate(t.id);
  };

  const openTaskMode = openTask ? effectiveMode(openTask) : "automatico";

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
          liveSec={liveSec}
          state={state}
          mode={openTaskMode}
          onPause={() => pauseMut.mutate()}
          onResume={() => resumeMut.mutate()}
          onComplete={() => endMut.mutate()}
          onManualEnd={() => manualEndMut.mutate(openTask.id)}
          pausing={pauseMut.isPending}
          resuming={resumeMut.isPending}
          ending={endMut.isPending}
          manualEnding={manualEndMut.isPending}
        />
      ) : (
        <UpcomingTasks
          tasks={upcoming ?? []}
          clientsMap={clientsMap ?? {}}
          isManager={isManager}
          currentUserId={user?.id ?? null}
          effectiveMode={effectiveMode}
          onStart={handleStart}
          starting={startMut.isPending || manualStartMut.isPending}
          startingId={startMut.variables ?? manualStartMut.variables ?? null}
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

      {/* Dialog de escolha de método (modo "ambos") */}
      <Dialog open={!!modeChoice} onOpenChange={(o) => !o && setModeChoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Como deseja registrar?</DialogTitle>
            <DialogDescription>
              Esta empresa permite ambos os modos. Escolha como abrir o ponto para esta tarefa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            <Button
              size="lg"
              className="h-14 justify-start"
              onClick={() => {
                if (!modeChoice) return;
                startMut.mutate(modeChoice.id);
                setModeChoice(null);
              }}
            >
              <Zap className="mr-2 h-5 w-5" />
              <div className="text-left">
                <div className="text-sm font-semibold">Automático</div>
                <div className="text-xs opacity-80">Inicia tarefa e abre o ponto em um clique.</div>
              </div>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 justify-start"
              onClick={() => {
                if (!modeChoice) return;
                manualStartMut.mutate(modeChoice.id);
                setModeChoice(null);
              }}
            >
              <Hand className="mr-2 h-5 w-5" />
              <div className="text-left">
                <div className="text-sm font-semibold">Manual</div>
                <div className="text-xs opacity-80">Bater entrada/saída manualmente durante a tarefa.</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActiveTaskCard({
  entry,
  task,
  clientName,
  liveSec,
  state,
  mode,
  onPause,
  onResume,
  onComplete,
  onManualEnd,
  pausing,
  resuming,
  ending,
  manualEnding,
}: {
  entry: TimeEntryRow;
  task: TaskRow;
  clientName?: string;
  liveSec: number;
  state: "aberto" | "pausado" | "encerrado";
  mode: PunchMode;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onManualEnd: () => void;
  pausing: boolean;
  resuming: boolean;
  ending: boolean;
  manualEnding: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-lg">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 text-xs font-medium uppercase tracking-wide text-primary">
        <span>Tarefa em andamento</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] tracking-normal">
          {mode === "manual" ? <Hand className="h-3 w-3" /> : mode === "ambos" ? <Hand className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
          {PUNCH_MODE_LABELS[mode]}
        </span>
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
            {formatHMS(liveSec)}
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
          {(mode === "manual" || mode === "ambos") && state !== "encerrado" && (
            <Button size="lg" variant="outline" className="h-14 text-base" disabled={manualEnding} onClick={onManualEnd}>
              <LogOut className="mr-2 h-5 w-5" /> Bater saída
            </Button>
          )}
          <Button
            size="lg"
            className="h-14 text-base sm:col-span-2"
            disabled={ending}
            onClick={onComplete}
          >
            <Square className="mr-2 h-5 w-5" /> Concluir tarefa
          </Button>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <TaskDocuments taskId={task.id} companyId={task.company_id} canManage={false} />
        </div>
      </div>
    </section>
  );
}

function UpcomingTasks({
  tasks,
  clientsMap,
  isManager,
  currentUserId,
  effectiveMode,
  onStart,
  starting,
  startingId,
  onRequestAuth,
  requestingAuth,
  requestingAuthId,
}: {
  tasks: TaskRow[];
  clientsMap: Record<string, string>;
  isManager: boolean;
  currentUserId: string | null;
  effectiveMode: (t: Pick<TaskRow, "punch_mode_override">) => PunchMode;
  onStart: (t: TaskRow) => void;
  starting: boolean;
  startingId: string | null;
  onRequestAuth: (id: string) => void;
  requestingAuth: boolean;
  requestingAuthId: string | null;
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
  // Prioriza tarefa pronta para iniciar; senão a primeira da fila.
  const nextStartable =
    tasks.find((t) => t.status === "autorizado" || t.status === "pendente" || t.status === "em_andamento") ?? tasks[0];
  const rest = tasks.filter((t) => t.id !== nextStartable.id);
  const nextIsStartable =
    nextStartable.status === "autorizado" ||
    nextStartable.status === "pendente" ||
    nextStartable.status === "em_andamento";
  const nextIsAbsent = nextStartable.status === "ausente";
  const nextStarting = starting && startingId === nextStartable.id;
  const nextRequesting = requestingAuth && requestingAuthId === nextStartable.id;
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
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {effectiveMode(nextStartable) === "automatico" ? <Zap className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                {PUNCH_MODE_LABELS[effectiveMode(nextStartable)]}
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

          {nextIsAbsent ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Tarefa marcada como <b>ausente</b>. Solicite nova autorização ao gestor para retomar a execução.
                </span>
              </div>
              <Button
                size="lg"
                variant="outline"
                className="h-16 w-full text-base"
                disabled={nextRequesting}
                onClick={() => onRequestAuth(nextStartable.id)}
              >
                <Send className="mr-2 h-5 w-5" />
                {nextRequesting ? "Enviando..." : "Solicitar autorização"}
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              className="h-16 w-full text-base"
              disabled={!nextIsStartable || nextStarting}
              onClick={() => onStart(nextStartable)}
            >
              {effectiveMode(nextStartable) === "manual" ? (
                <><LogIn className="mr-2 h-6 w-6" /> Bater entrada</>
              ) : nextStartable.status === "em_andamento" ? (
                <><LogIn className="mr-2 h-6 w-6" /> Bater entrada</>
              ) : (
                <><Play className="mr-2 h-6 w-6" /> Iniciar tarefa</>
              )}
            </Button>
          )}
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
          const tMode = effectiveMode(t);
          const isOwn = !!currentUserId && t.assigned_to === currentUserId;
          const canStart =
            (t.status === "pendente" || t.status === "autorizado" || t.status === "em_andamento") && isOwn;
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
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {tMode === "automatico" ? <Zap className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                    {PUNCH_MODE_LABELS[tMode]}
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
                variant={t.status === "ausente" ? "outline" : "default"}
                disabled={
                  isStarting ||
                  (t.status !== "ausente" && !canStart) ||
                  (t.status === "ausente" && requestingAuth && requestingAuthId === t.id)
                }
                onClick={() =>
                  t.status === "ausente" ? onRequestAuth(t.id) : onStart(t)
                }
              >
                {t.status === "ausente" ? (
                  <>
                    <Send className="mr-2 h-5 w-5" />
                    Solicitar autorização
                  </>
                ) : tMode === "manual" || t.status === "em_andamento" ? (
                  <>
                    <LogIn className="mr-2 h-5 w-5" />
                    Bater entrada
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Iniciar
                  </>
                )}
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