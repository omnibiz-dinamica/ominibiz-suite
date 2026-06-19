import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Plus, Play, Check, X, ShieldCheck, UserX, Clock, Pencil, Repeat, UserCog, Users, Trash2 } from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_TONE,
  PUNCH_MODE_LABELS,
  type TaskAction,
  type TaskRow,
  type PunchMode,
  ACTION_LABELS,
  availableActions,
  isVisuallyLate,
  sweepAbsent,
  transitionTask,
} from "@/lib/tasks";
import { RecurrenceForm, emptyRecurrence, type RecurrenceFormValue } from "@/components/tasks/RecurrenceForm";
import { TaskDocuments } from "@/components/tasks/TaskDocuments";
import { ReassignDialog } from "@/components/tasks/ReassignDialog";
import { EditRecurrenceDialog } from "@/components/tasks/EditRecurrenceDialog";
import type { RecurrenceRow } from "@/lib/tasks";
import {
  wallInputToISO,
  wallISOToInput,
  formatWallDate,
  formatWallTime,
  formatLocalTime,
} from "@/lib/wall-clock";

export const Route = createFileRoute("/app/tarefas")({
  component: TasksPage,
});

function TasksPage() {
  const { user, isManager, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [reassigning, setReassigning] = useState<TaskRow | null>(null);
  const [editingSeries, setEditingSeries] = useState<TaskRow | null>(null);
  const [seriesRow, setSeriesRow] = useState<RecurrenceRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);

  useEffect(() => {
    if (!editingSeries?.recurrence_id) {
      setSeriesRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("task_recurrences" as any) as any)
        .select("*")
        .eq("id", editingSeries.recurrence_id)
        .maybeSingle();
      if (!cancelled) setSeriesRow((data ?? null) as RecurrenceRow | null);
    })();
    return () => { cancelled = true; };
  }, [editingSeries?.recurrence_id]);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", currentCompanyId, user?.id, isManager],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*")
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (!isManager) q = q.eq("assigned_to", user!.id);
      else if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
    enabled: !!user,
  });

  const { data: members } = useQuery({
    queryKey: ["members", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", currentCompanyId);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return profs ?? [];
    },
    enabled: isManager && !!currentCompanyId,
  });

  const { data: clientsList } = useQuery({
    queryKey: ["clients-min", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [] as { id: string; name: string }[];
      const { data, error } = await (supabase.from("clients" as never) as any)
        .select("id,name")
        .eq("company_id", currentCompanyId)
        .eq("status", "ativo")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; name: string }[];
    },
    enabled: isManager && !!currentCompanyId,
  });

  // Varredura de ausentes por evento: ao carregar a tela. Nunca em loop.
  useEffect(() => {
    if (!user || !isManager) return;
    void sweepAbsent(currentCompanyId).then((n) => {
      if (n > 0) qc.invalidateQueries({ queryKey: ["tasks"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isManager, currentCompanyId]);

  // Realtime: APENAS sincroniza a UI. Nenhuma lógica de negócio aqui.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`user:${user.id}:tasks-ui-sync`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => qc.invalidateQueries({ queryKey: ["tasks"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: TaskAction }) => transitionTask(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("task_soft_delete", { _task_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Tarefa excluída");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Status que podem ser excluídos (tarefas que ainda não foram iniciadas).
  // A presença de histórico operacional (folha de ponto, documentos)
  // é validada no servidor e devolve a mensagem padrão.
  const DELETABLE_STATUSES: TaskRow["status"][] = [
    "pendente",
    "autorizado",
    "cancelado",
    "ausente",
  ];
  const canDelete = (t: TaskRow) =>
    isManager && DELETABLE_STATUSES.includes(t.status);

  const handleDeleteRequest = (t: TaskRow) => {
    if (!isManager) return;
    if (!canDelete(t)) {
      toast.error("Esta tarefa possui histórico operacional e não pode ser excluída.");
      return;
    }
    setDeleting(t);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Tarefas</h1>
          <p className="mt-1 text-muted-foreground">
            {isManager ? "Crie, atribua e acompanhe a operação." : "Suas tarefas atribuídas."}
          </p>
        </div>
        {isManager && currentCompanyId && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/app/tarefas/recorrentes"><Repeat className="mr-2 h-4 w-4" /> Recorrências</Link>
            </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nova tarefa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
              <TaskForm members={members ?? []} clients={clientsList ?? []} companyId={currentCompanyId} userId={user!.id} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tasks"] }); }} />
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar tarefa</DialogTitle></DialogHeader>
          {editing && (
            <>
            <TaskForm
              initial={editing}
              members={members ?? []}
              clients={clientsList ?? []}
              companyId={editing.company_id}
              userId={user!.id}
              onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
            />
              <div className="mt-6 border-t border-border pt-4">
                <TaskDocuments taskId={editing.id} companyId={editing.company_id} canManage={isManager} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ReassignDialog
        task={reassigning}
        members={members ?? []}
        open={!!reassigning}
        onOpenChange={(v) => !v && setReassigning(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["tasks"] })}
      />

      <EditRecurrenceDialog
        recurrence={seriesRow}
        task={editingSeries}
        members={members ?? []}
        open={!!editingSeries && !!seriesRow}
        onOpenChange={(v) => !v && setEditingSeries(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["recurrences"] });
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && !deleteTask.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.title
                ? `A tarefa "${deleting.title}" será removida das listas, calendário, folha de ponto e notificações. O histórico permanece registado para auditoria.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTask.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteTask.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) deleteTask.mutate(deleting.id);
              }}
            >
              {deleteTask.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!currentCompanyId && isManager && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
          Sua empresa ainda está aguardando aprovação. Você poderá criar tarefas assim que for liberada.
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      )}
      {!isLoading && (tasks ?? []).length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          Nenhuma tarefa ainda.
        </div>
      )}

      {!isLoading && (tasks ?? []).length > 0 && isManager && (
        <GroupedByAssignee
          tasks={tasks ?? []}
          members={members ?? []}
          userId={user!.id}
          isManager={isManager}
          onEdit={setEditing}
          onEditSeries={setEditingSeries}
          onReassign={setReassigning}
          onDelete={handleDeleteRequest}
          onTransition={(id, action) => transition.mutate({ id, action })}
          transitionPending={transition.isPending}
        />
      )}

      {!isLoading && (tasks ?? []).length > 0 && !isManager && (
        <div className="rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {(tasks ?? []).map((t) => (
              <TaskRowItem
                key={t.id}
                task={t}
                userId={user!.id}
                isManager={isManager}
                onEdit={setEditing}
                onEditSeries={setEditingSeries}
                onReassign={setReassigning}
                onDelete={handleDeleteRequest}
                onTransition={(id, action) => transition.mutate({ id, action })}
                transitionPending={transition.isPending}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agrupamento por funcionário (visão do gestor)
// ---------------------------------------------------------------------------

interface RowHandlers {
  userId: string;
  isManager: boolean;
  onEdit: (t: TaskRow) => void;
  onEditSeries: (t: TaskRow) => void;
  onReassign: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
  onTransition: (id: string, action: TaskAction) => void;
  transitionPending: boolean;
}

function GroupedByAssignee({
  tasks,
  members,
  ...handlers
}: RowHandlers & {
  tasks: TaskRow[];
  members: { id: string; full_name: string | null }[];
}) {
  const nameOf = (id: string | null) =>
    members.find((m) => m.id === id)?.full_name ?? (id ? id.slice(0, 8) : "Sem responsável");

  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const k = t.assigned_to ?? "__unassigned__";
    const arr = groups.get(k) ?? [];
    arr.push(t);
    groups.set(k, arr);
  }
  const entries = Array.from(groups.entries()).sort(([a], [b]) =>
    nameOf(a === "__unassigned__" ? null : a).localeCompare(
      nameOf(b === "__unassigned__" ? null : b),
    ),
  );

  return (
    <div className="rounded-2xl border border-border bg-card">
      <Accordion type="multiple" className="divide-y divide-border">
        {entries.map(([key, list]) => {
          const name = nameOf(key === "__unassigned__" ? null : key);
          return (
            <AccordionItem key={key} value={key} className="border-b-0">
              <AccordionTrigger className="px-5 hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Users className="h-4 w-4" />
                  </span>
                  <span className="font-display text-base font-semibold">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({list.length} {list.length === 1 ? "tarefa" : "tarefas"})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <ul className="divide-y divide-border border-t border-border">
                  {list.map((t) => (
                    <TaskRowItem key={t.id} task={t} {...handlers} />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function TaskRowItem({
  task: t,
  userId,
  isManager,
  onEdit,
  onEditSeries,
  onReassign,
  onDelete,
  onTransition,
  transitionPending,
}: RowHandlers & { task: TaskRow }) {
  const late = isVisuallyLate(t);
  const actions = availableActions(t, { userId, isManager });
  const date = formatWallDate(t.scheduled_for);
  const start = formatWallTime(t.scheduled_for);
  const end = formatWallTime(t.scheduled_end);
  const updated = formatLocalTime(t.updated_at);

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t.title}</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[t.status]}`}>
            {STATUS_LABELS[t.status]}
          </span>
          {late && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
              <Clock className="h-3 w-3" /> atrasado
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {date && <span>{date}</span>}
          {(start || end) && (
            <span className="font-mono">
              {start || "--:--"} → {end || "--:--"}
            </span>
          )}
          {updated && <span>Atualizado: {updated}</span>}
        </div>
        {t.description && (
          <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.description}</div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {isManager && (
          <>
            <Button size="sm" variant="ghost" title="Editar" onClick={() => onEdit(t)}>
              <Pencil className="h-3 w-3" />
            </Button>
            {t.recurrence_id && (
              <Button size="sm" variant="ghost" title="Editar série" onClick={() => onEditSeries(t)}>
                <Repeat className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" title="Reatribuir" onClick={() => onReassign(t)}>
              <UserCog className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title={
                t.status === "em_andamento" || t.status === "concluido"
                  ? "Tarefa com histórico operacional — não pode ser excluída"
                  : "Excluir tarefa"
              }
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(t)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
        {actions.map((a) => (
          <ActionButton
            key={a}
            action={a}
            disabled={transitionPending}
            onClick={() => onTransition(t.id, a)}
          />
        ))}
      </div>
    </li>
  );
}

function ActionButton({
  action,
  onClick,
  disabled,
}: {
  action: TaskAction;
  onClick: () => void;
  disabled?: boolean;
}) {
  const map = {
    autorizar: { Icon: ShieldCheck, variant: "outline" as const },
    iniciar: { Icon: Play, variant: "outline" as const },
    concluir: { Icon: Check, variant: "default" as const },
    marcar_ausente: { Icon: UserX, variant: "ghost" as const },
    cancelar: { Icon: X, variant: "ghost" as const },
  }[action];
  const { Icon, variant } = map;
  return (
    <Button size="sm" variant={variant} onClick={onClick} disabled={disabled} title={ACTION_LABELS[action]}>
      <Icon className="h-3 w-3" />
      <span className="ml-1 hidden sm:inline">{ACTION_LABELS[action]}</span>
    </Button>
  );
}

function TaskForm({
  members,
  clients,
  companyId,
  userId,
  initial,
  onDone,
}: {
  members: { id: string; full_name: string | null }[];
  clients: { id: string; name: string }[];
  companyId: string;
  userId: string;
  initial?: TaskRow;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignedTo, setAssignedTo] = useState<string>(initial?.assigned_to ?? "");
  const [clientId, setClientId] = useState<string>(initial?.client_id ?? "");
  const [priority, setPriority] = useState<"baixa" | "media" | "alta" | "urgente">(initial?.priority ?? "media");
  const [scheduledFor, setScheduledFor] = useState<string>(wallISOToInput(initial?.scheduled_for));
  const [scheduledEnd, setScheduledEnd] = useState<string>(wallISOToInput(initial?.scheduled_end));
  const [graceMinutes, setGraceMinutes] = useState<number>(initial?.absence_grace_minutes ?? 15);
  const [punchMode, setPunchMode] = useState<PunchMode | "">(
    (initial?.punch_mode_override as PunchMode) ?? "",
  );
  const [recurrence, setRecurrence] = useState<RecurrenceFormValue>(emptyRecurrence());
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        // Validação defensiva de horários — evita erro "valor inválido" do Postgres.
        const startISO = wallInputToISO(scheduledFor);
        const endISO = wallInputToISO(scheduledEnd);
        if (scheduledFor && !startISO) {
          toast.error("Horário de início inválido.");
          return;
        }
        if (scheduledEnd && !endISO) {
          toast.error("Horário de fim inválido.");
          return;
        }
        if (startISO && endISO && endISO < startISO) {
          toast.error("O horário de fim deve ser posterior ao de início.");
          return;
        }
        setLoading(true);
        // Título derivado do cliente quando não preenchido manualmente.
        const clientName = clients.find((c) => c.id === clientId)?.name ?? "";
        const finalTitle =
          title.trim() || clientName.trim() || (description.trim().slice(0, 80) || "Tarefa");
        const payload = {
          title: finalTitle,
          description: description.trim() || null,
          assigned_to: assignedTo || null,
          client_id: clientId || null,
          priority,
          // Wall-clock: preservar o horário exato cadastrado, sem fuso.
          scheduled_for: startISO,
          scheduled_end: endISO,
          absence_grace_minutes: graceMinutes,
          punch_mode_override: punchMode || null,
        };
        let error: { message: string } | null = null;
        if (initial) {
          ({ error } = await supabase.from("tasks").update(payload).eq("id", initial.id));
        } else if (recurrence.enabled) {
          // Cria recorrência e materializa as próximas 14 dias.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ins = await (supabase.from("task_recurrences" as any) as any).insert({
            company_id: companyId,
            created_by: userId,
            title: payload.title,
            description: payload.description,
            assigned_to: payload.assigned_to,
            client_id: payload.client_id,
            priority: payload.priority,
            absence_grace_minutes: payload.absence_grace_minutes,
            punch_mode_override: payload.punch_mode_override,
            frequency: recurrence.frequency,
            weekdays: recurrence.frequency === "weekly" ? recurrence.weekdays : [],
            monthly_rule:
              recurrence.frequency === "monthly" ? { day_of_month: recurrence.dayOfMonth } : {},
            start_date: recurrence.startDate,
            end_date: recurrence.endDate || null,
            scheduled_time: recurrence.scheduledTime,
            duration_minutes: recurrence.durationMinutes,
          });
          error = ins.error;
          if (!error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)("recurrence_materialize", {
              _days_ahead: 14,
              _company_id: companyId,
            });
          }
        } else {
          ({ error } = await supabase
            .from("tasks")
            .insert({ ...payload, company_id: companyId, created_by: userId }));
        }
        setLoading(false);
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success(initial ? "Tarefa atualizada" : "Tarefa criada");
        onDone();
      }}
    >
      <div className="space-y-1.5">
        <Label>Cliente</Label>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Atribuir a</Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Início</Label>
          <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Fim</Label>
          <Input type="datetime-local" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Tolerância de ausência (min)</Label>
          <Input
            type="number"
            min={0}
            max={1440}
            value={graceMinutes}
            onChange={(e) => setGraceMinutes(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Modo de folha de ponto</Label>
          <Select value={punchMode || "default"} onValueChange={(v) => setPunchMode(v === "default" ? "" : (v as PunchMode))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Padrão da empresa</SelectItem>
              <SelectItem value="automatico">{PUNCH_MODE_LABELS.automatico}</SelectItem>
              <SelectItem value="manual">{PUNCH_MODE_LABELS.manual}</SelectItem>
              <SelectItem value="ambos">{PUNCH_MODE_LABELS.ambos}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {!initial && (
        <RecurrenceForm value={recurrence} onChange={setRecurrence} />
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Salvando..." : initial ? "Salvar alterações" : "Criar tarefa"}
      </Button>
    </form>
  );
}