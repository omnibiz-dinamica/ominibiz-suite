import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/dialog";
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
import {
  Plus,
  Play,
  Check,
  X,
  ShieldCheck,
  UserX,
  Clock,
  Pencil,
  Repeat,
  UserCog,
  Users,
  Trash2,
  Archive,
  ArchiveRestore,
  CalendarDays,
  Building2,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileText,
  Ban,
  ListTodo,
  XCircle,
  Search,
} from "lucide-react";
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
  archiveTask,
  canArchive,
} from "@/lib/tasks";
import { RecurrenceForm, emptyRecurrence, type RecurrenceFormValue } from "@/components/tasks/RecurrenceForm";
import { TaskDocuments } from "@/components/tasks/TaskDocuments";
import { ReassignDialog } from "@/components/tasks/ReassignDialog";
import { EditRecurrenceDialog } from "@/components/tasks/EditRecurrenceDialog";
import type { RecurrenceRow } from "@/lib/tasks";
import { isRefused } from "@/lib/tasks";
import { CancelTaskDialog } from "@/components/tasks/CancelTaskDialog";

import { EmployeePicker } from "@/components/common/EmployeePicker";
import {
  wallISOToDateInput,
  wallDateToEndOfDayISO,
  wallDateTimeToISO,
  formatWallDate,
  formatWallTime,
  formatLocalTime,
} from "@/lib/wall-clock";

// Filtros aceitos via search-params. `atrasadas` é filtro derivado
// (não é status persistido) — combina "não concluído" + due_at no passado.
const STATUS_FILTERS = [
  "pendente",
  "autorizado",
  "em_andamento",
  "concluido",
  "cancelado",
  "ausente",
  "atrasadas",
  "recusadas",
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];
type TasksSearch = { status?: StatusFilter; employee?: string; client?: string; task?: string };
type ClientOption = { id: string; name: string; timing_mode?: "start_stop" | "manual" | null };
type CalendarMode = "day" | "week" | "month" | "year";
const TASK_DOC_ACCEPT = "application/pdf,image/png,image/jpeg,image/jpg";
const TASK_DOC_MAX_SIZE = 10 * 1024 * 1024;
const TASK_DOC_ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg"]);

export const Route = createFileRoute("/app/tarefas")({
  component: TasksPage,
  validateSearch: (raw): TasksSearch => {
    const s = raw as Record<string, unknown>;
    const status =
      typeof s.status === "string" && (STATUS_FILTERS as readonly string[]).includes(s.status)
        ? (s.status as StatusFilter)
        : undefined;
    const employee = typeof s.employee === "string" && s.employee ? s.employee : undefined;
    const client = typeof s.client === "string" && s.client ? s.client : undefined;
    const task = typeof s.task === "string" && s.task ? s.task : undefined;
    return { status, employee, client, task };
  },
});

function TasksPage() {
  const { user, isManager, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [reassigning, setReassigning] = useState<TaskRow | null>(null);
  const [editingSeries, setEditingSeries] = useState<TaskRow | null>(null);
  const [seriesRow, setSeriesRow] = useState<RecurrenceRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);
  const [refusing, setRefusing] = useState<TaskRow | null>(null);
  // ADR-036 — cancelamento sempre com motivo obrigatório e auditado.
  const [cancelling, setCancelling] = useState<TaskRow | null>(null);
  const [refusalReason, setRefusalReason] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [taskView, setTaskView] = useState<"list" | "calendar">("list");
  const [calendarGroup, setCalendarGroup] = useState<"assignee" | "client">("assignee");

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
    return () => {
      cancelled = true;
    };
  }, [editingSeries?.recurrence_id]);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", currentCompanyId, user?.id, isManager, view],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (!isManager) q = q.eq("assigned_to", user!.id);
      else if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      if (view === "archived") q = q.not("archived_at", "is", null);
      else q = q.is("archived_at", null);
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
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("company_id", currentCompanyId);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, job_title").in("id", ids);
      return profs ?? [];
    },
    enabled: isManager && !!currentCompanyId,
  });

  const { data: clientsList } = useQuery({
    queryKey: ["clients-min", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [] as ClientOption[];
      const { data, error } = await (supabase.from("clients" as never) as any)
        .select("id,name,timing_mode")
        .eq("company_id", currentCompanyId)
        .eq("status", "ativo")
        .order("name", { ascending: true });
      if (error) return [] as ClientOption[];
      return (data ?? []) as unknown as ClientOption[];
    },
    enabled: !!currentCompanyId,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () =>
        qc.invalidateQueries({ queryKey: ["tasks"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const transition = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: TaskAction; reason?: string }) =>
      transitionTask(id, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa atualizada");
      setRefusing(null);
      setRefusalReason("");
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

  const archiveMut = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => archiveTask(id, archive),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(vars.archive ? "Tarefa arquivada" : "Tarefa desarquivada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveTaskDate = useMutation({
    mutationFn: async ({ id, dateKey }: { id: string; dateKey: string }) => {
      const task = (tasks ?? []).find((t) => t.id === id);
      if (!task) throw new Error("Tarefa nao encontrada");
      const startTime = formatWallTime(task.scheduled_for);
      const endTime = formatWallTime(task.scheduled_end);
      const scheduledFor = startTime ? wallDateTimeToISO(dateKey, startTime) : null;
      const scheduledEnd = endTime ? wallDateTimeToISO(dateKey, endTime) : null;
      const dueAt = scheduledEnd ?? wallDateToEndOfDayISO(dateKey);
      const { error } = await supabase
        .from("tasks")
        .update({
          scheduled_for: scheduledFor,
          scheduled_end: scheduledEnd,
          due_at: dueAt,
          recurrence_date: dateKey,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa reagendada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Status que podem ser excluídos (tarefas que ainda não foram iniciadas).
  // A presença de histórico operacional (folha de ponto, documentos)
  // é validada no servidor e devolve a mensagem padrão.
  const DELETABLE_STATUSES: TaskRow["status"][] = ["pendente", "autorizado", "cancelado", "ausente"];
  const canDelete = (t: TaskRow) => isManager && DELETABLE_STATUSES.includes(t.status);

  const handleDeleteRequest = (t: TaskRow) => {
    if (!isManager) return;
    if (!canDelete(t)) {
      toast.error("Esta tarefa possui histórico operacional e não pode ser excluída.");
      return;
    }
    setDeleting(t);
  };
  const handleTransition = (task: TaskRow, action: TaskAction) => {
    if (action === "cancelar") {
      setCancelling(task);
      return;
    }
    if (action === "recusar") {
      setRefusing(task);
      setRefusalReason("");
      return;
    }
    transition.mutate({ id: task.id, action });
  };
  const submitRefusal = () => {
    const reason = refusalReason.trim();
    if (!refusing) return;
    if (reason.length < 3) {
      toast.error("Informe o motivo da recusa.");
      return;
    }
    transition.mutate({ id: refusing.id, action: "recusar", reason });
  };

  // Filtros derivados (status + funcionário) — Fase F.
  const filteredTasks = useMemo(() => {
    const all = tasks ?? [];
    return all.filter((t) => {
      if (search.task && t.id !== search.task) return false;
      if (search.employee && t.assigned_to !== search.employee) return false;
      if (search.client && t.client_id !== search.client) return false;
      if (!search.status) return true;
      if (search.status === "atrasadas") {
        return isVisuallyLate(t);
      }
      if (search.status === "recusadas") {
        return isRefused(t);
      }
      if (search.status === "pendente") {
        return t.status === "pendente" && !isVisuallyLate(t);
      }
      return t.status === search.status;
    });
  }, [tasks, search.status, search.employee, search.client, search.task]);

  // Contador de recusas pendentes de decisão do gestor (SUP-2026-000077).
  const refusedCount = useMemo(() => (tasks ?? []).filter((t) => isRefused(t)).length, [tasks]);


  const setStatusFilter = (next: StatusFilter | undefined) => {
    void navigate({
      search: (prev: TasksSearch) => ({ ...prev, status: next }),
      replace: true,
    });
  };
  const setEmployeeFilter = (next: string | undefined) => {
    void navigate({
      search: (prev: TasksSearch) => ({ ...prev, employee: next }),
      replace: true,
    });
  };
  const setClientFilter = (next: string | undefined) => {
    void navigate({
      search: (prev: TasksSearch) => ({ ...prev, client: next }),
      replace: true,
    });
  };

  return (
    <div className="space-y-6">
      {search.task && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Mostrando apenas a tarefa aberta pela notificação.</span>
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-2"
            onClick={() => void navigate({ search: (prev: TasksSearch) => ({ ...prev, task: undefined }), replace: true })}
          >
            Limpar tarefa aberta pela notificação
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Tarefas</h1>
          <p className="mt-1 text-muted-foreground">
            {isManager ? "Crie, atribua e acompanhe a operação." : "Suas tarefas atribuídas."}
          </p>
        </div>
        {isManager && currentCompanyId && (
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setView("active")}
                className={`px-3 py-1.5 text-xs font-medium ${view === "active" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                Ativas
              </button>
              <button
                type="button"
                onClick={() => setView("archived")}
                className={`px-3 py-1.5 text-xs font-medium ${view === "archived" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                Arquivadas
              </button>
            </div>
            <Button asChild variant="outline">
              <Link to="/app/tarefas/recorrentes">
                <Repeat className="mr-2 h-4 w-4" /> Recorrências
              </Link>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Nova tarefa
                </Button>
              </DialogTrigger>
              <DialogContent size="lg">
                <ModalHeader icon={ListTodo} title="Nova tarefa" description="Crie uma tarefa e atribua a um colaborador." />
                <TaskForm
                  formId="task-form-create"
                  members={members ?? []}
                  clients={clientsList ?? []}
                  companyId={currentCompanyId}
                  userId={user!.id}
                  onCancel={() => setOpen(false)}
                  onDone={() => {
                    setOpen(false);
                    qc.invalidateQueries({ queryKey: ["tasks"] });
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent size="lg">
          <ModalHeader icon={ListTodo} title="Editar tarefa" description="Atualize os dados e anexos da tarefa." />
          {editing && (
            <TaskForm
              formId="task-form-edit"
              initial={editing}
              members={members ?? []}
              clients={clientsList ?? []}
              companyId={editing.company_id}
              userId={user!.id}
              onCancel={() => setEditing(null)}
              onDone={() => {
                setEditing(null);
                qc.invalidateQueries({ queryKey: ["tasks"] });
              }}
              documentsSlot={<TaskDocuments taskId={editing.id} companyId={editing.company_id} canManage={isManager} />}
            />
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

      <CancelTaskDialog
        task={cancelling}
        clientName={cancelling?.client_id ? clientsList?.find((c) => c.id === cancelling.client_id)?.name : undefined}
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        onDone={() => {
          setCancelling(null);
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />

      <Dialog open={!!refusing} onOpenChange={(v) => !v && !transition.isPending && setRefusing(null)}>
        <DialogContent size="sm">
          <ModalHeader icon={XCircle} title="Recusar tarefa?" description="Confirme a recusa e informe o motivo." />
          <ModalBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A tarefa ficará cancelada e o gestor poderá reatribuir se necessário.
            </p>
            {refusing?.title && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                {refusing.title}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="task-refusal-reason">Motivo *</Label>
              <Textarea
                id="task-refusal-reason"
                value={refusalReason}
                onChange={(event) => setRefusalReason(event.target.value)}
                rows={3}
                placeholder="Ex.: vou faltar, cliente desistiu, não posso fazer, transferir para outra pessoa..."
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" disabled={transition.isPending} onClick={() => setRefusing(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={transition.isPending} onClick={submitRefusal}>
              {transition.isPending ? "Recusando..." : "Confirmar recusa"}
            </Button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

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
      {isManager && currentCompanyId && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <FilterChip label="Lista" active={taskView === "list"} onClick={() => setTaskView("list")} />
            <FilterChip label="Calendário" active={taskView === "calendar"} onClick={() => setTaskView("calendar")} />
          </div>
          {taskView === "calendar" && (
            <div className="flex flex-wrap items-center gap-1">
              <FilterChip
                label="Por colaborador"
                active={calendarGroup === "assignee"}
                onClick={() => setCalendarGroup("assignee")}
              />
              <FilterChip
                label="Por cliente"
                active={calendarGroup === "client"}
                onClick={() => setCalendarGroup("client")}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <FilterChip label="Todos" active={!search.status} onClick={() => setStatusFilter(undefined)} />
            {(
              [
                ["pendente", "Pendentes"],
                ["em_andamento", "Em andamento"],
                ["concluido", "Concluídas"],
                ["atrasadas", "Atrasadas"],
                ["recusadas", refusedCount > 0 ? `Recusadas (${refusedCount})` : "Recusadas"],
              ] as const
            ).map(([key, label]) => (
              <FilterChip
                key={key}
                label={label}
                active={search.status === key}
                onClick={() => setStatusFilter(search.status === key ? undefined : (key as StatusFilter))}
              />
            ))}

          </div>
          <div className="ml-auto grid w-full gap-2 sm:w-auto sm:grid-cols-2">
            <EmployeePicker
              employees={(members ?? []).map((m) => ({
                id: m.id,
                full_name: m.full_name,
                job_title: (m as { job_title?: string | null }).job_title ?? null,
              }))}
              value={search.employee ?? null}
              onChange={(id) => setEmployeeFilter(id || undefined)}
              placeholder="Todos os funcionários"
              ariaLabel="Filtrar por funcionário"
            />
            <Select
              value={search.client ?? "all"}
              onValueChange={(id) => setClientFilter(id === "all" ? undefined : id)}
            >
              <SelectTrigger aria-label="Filtrar por cliente">
                <SelectValue placeholder="Todos os clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {(clientsList ?? []).map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {search.employee && (
              <button
                type="button"
                onClick={() => setEmployeeFilter(undefined)}
                className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Limpar filtro de funcionário
              </button>
            )}
            {search.client && (
              <button
                type="button"
                onClick={() => setClientFilter(undefined)}
                className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Limpar filtro de cliente
              </button>
            )}
          </div>
        </div>
      )}
      {!isLoading && filteredTasks.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          {view === "archived"
            ? "Nenhuma tarefa arquivada."
            : search.status || search.employee || search.client
              ? "Nenhuma tarefa corresponde ao filtro atual."
              : "Nenhuma tarefa ainda."}
        </div>
      )}

      {!isLoading && filteredTasks.length > 0 && isManager && taskView === "list" && (
        <GroupedByAssignee
          tasks={filteredTasks}
          members={members ?? []}
          userId={user!.id}
          isManager={isManager}
          onEdit={setEditing}
          onEditSeries={setEditingSeries}
          onReassign={setReassigning}
          onDelete={handleDeleteRequest}
          onTransition={handleTransition}
          onArchive={(id, archive) => archiveMut.mutate({ id, archive })}
          onMoveDate={(id, dateKey) => moveTaskDate.mutate({ id, dateKey })}
          transitionPending={transition.isPending}
          archivePending={archiveMut.isPending}
        />
      )}

      {!isLoading && filteredTasks.length > 0 && isManager && taskView === "calendar" && (
        <TaskPlanningCalendar
          tasks={filteredTasks}
          members={members ?? []}
          clients={clientsList ?? []}
          groupBy={calendarGroup}
          userId={user!.id}
          isManager={isManager}
          onEdit={setEditing}
          onEditSeries={setEditingSeries}
          onReassign={setReassigning}
          onDelete={handleDeleteRequest}
          onTransition={handleTransition}
          onArchive={(id, archive) => archiveMut.mutate({ id, archive })}
          onMoveDate={(id, dateKey) => moveTaskDate.mutate({ id, dateKey })}
          transitionPending={transition.isPending}
          archivePending={archiveMut.isPending}
        />
      )}

      {!isManager && !isLoading && (
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card px-3 py-2">
          <FilterChip label="Lista" active={taskView === "list"} onClick={() => setTaskView("list")} />
          <FilterChip label="Calendário" active={taskView === "calendar"} onClick={() => setTaskView("calendar")} />
        </div>
      )}

      {!isLoading && filteredTasks.length > 0 && !isManager && taskView === "list" && (
        <div className="rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {filteredTasks.map((t) => (
              <TaskRowItem
                key={t.id}
                task={t}
                userId={user!.id}
                isManager={isManager}
                onEdit={setEditing}
                onEditSeries={setEditingSeries}
                onReassign={setReassigning}
                onDelete={handleDeleteRequest}
                onTransition={handleTransition}
                onArchive={(id, archive) => archiveMut.mutate({ id, archive })}
                onMoveDate={(id, dateKey) => moveTaskDate.mutate({ id, dateKey })}
                transitionPending={transition.isPending}
                archivePending={archiveMut.isPending}
              />
            ))}
          </ul>
        </div>
      )}

      {!isLoading && filteredTasks.length > 0 && !isManager && taskView === "calendar" && (
        <TaskPlanningCalendar
          tasks={filteredTasks}
          members={members ?? []}
          clients={clientsList ?? []}
          groupBy="client"
          userId={user!.id}
          isManager={false}
          onEdit={() => {}}
          onEditSeries={setEditingSeries}
          onReassign={setReassigning}
          onDelete={handleDeleteRequest}
          onTransition={handleTransition}
          onArchive={(id, archive) => archiveMut.mutate({ id, archive })}
          onMoveDate={(id, dateKey) => moveTaskDate.mutate({ id, dateKey })}
          transitionPending={transition.isPending}
          archivePending={archiveMut.isPending}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full px-3 py-1 text-xs font-medium transition " +
        (active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </button>
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
  onTransition: (task: TaskRow, action: TaskAction) => void;
  onArchive: (id: string, archive: boolean) => void;
  onMoveDate: (id: string, dateKey: string) => void;
  transitionPending: boolean;
  archivePending: boolean;
}

function TaskPlanningCalendar({
  tasks,
  members,
  clients,
  groupBy,
  ...handlers
}: RowHandlers & {
  tasks: TaskRow[];
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client";
}) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const memberName = (id: string | null) =>
    members.find((m) => m.id === id)?.full_name ?? (id ? id.slice(0, 8) : "Sem responsavel");
  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? (id ? id.slice(0, 8) : "Sem cliente");
  const taskDate = (task: TaskRow) => {
    const source = task.scheduled_for ?? task.recurrence_date ?? task.due_at;
    if (!source) return null;
    const date = new Date(source);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const startOfWeek = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  };
  const addDays = (date: Date, days: number) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  };
  const sortTasks = (list: TaskRow[]) =>
    list
      .slice()
      .sort((a, b) =>
        (a.scheduled_for ?? a.recurrence_date ?? a.due_at ?? "").localeCompare(
          b.scheduled_for ?? b.recurrence_date ?? b.due_at ?? "",
        ),
      );
  const tasksForKey = (list: TaskRow[], key: string) =>
    sortTasks(list).filter((task) => {
      const date = taskDate(task);
      return date ? dateKey(date) === key : false;
    });
  const addPeriod = (direction: -1 | 1) => {
    setCursor((current) => {
      const next = new Date(current);
      if (mode === "day") next.setDate(next.getDate() + direction);
      if (mode === "week") next.setDate(next.getDate() + direction * 7);
      if (mode === "month") next.setMonth(next.getMonth() + direction);
      if (mode === "year") next.setFullYear(next.getFullYear() + direction);
      return next;
    });
  };
  const periodLabel = useMemo(() => {
    if (mode === "day") {
      return cursor.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    }
    if (mode === "week") {
      const start = startOfWeek(cursor);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })} - ${end.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}`;
    }
    if (mode === "month") {
      return cursor.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
    }
    return cursor.toLocaleDateString("pt-PT", { year: "numeric" });
  }, [cursor, mode]);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index));
  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [cursor]);
  const yearMonths = useMemo(
    () => Array.from({ length: 12 }, (_, month) => new Date(cursor.getFullYear(), month, 1)),
    [cursor],
  );

  const groups = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const key = groupBy === "assignee" ? (task.assigned_to ?? "__unassigned__") : (task.client_id ?? "__no_client__");
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }
  const groupEntries = Array.from(groups.entries()).sort(([a], [b]) => {
    const labelA =
      groupBy === "assignee"
        ? memberName(a === "__unassigned__" ? null : a)
        : clientName(a === "__no_client__" ? null : a);
    const labelB =
      groupBy === "assignee"
        ? memberName(b === "__unassigned__" ? null : b)
        : clientName(b === "__no_client__" ? null : b);
    return labelA.localeCompare(labelB);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <Button type="button" variant="ghost" size="sm" title="Periodo anterior" onClick={() => addPeriod(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button type="button" variant="ghost" size="sm" title="Proximo periodo" onClick={() => addPeriod(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-w-48 flex-1 text-sm font-semibold capitalize">{periodLabel}</div>
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["day", "Dia"],
              ["week", "Semana"],
              ["month", "Mes"],
              ["year", "Ano"],
            ] as const
          ).map(([key, label]) => (
            <FilterChip key={key} label={label} active={mode === key} onClick={() => setMode(key)} />
          ))}
        </div>
      </div>

      {groupEntries.map(([key, groupTasks]) => {
        const title =
          groupBy === "assignee"
            ? memberName(key === "__unassigned__" ? null : key)
            : clientName(key === "__no_client__" ? null : key);

        return (
          <section key={key} className="rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                {groupBy === "assignee" ? <Users className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              </span>
              <div>
                <h2 className="font-display text-base font-semibold">{title}</h2>
                <p className="text-xs text-muted-foreground">
                  {groupTasks.length} {groupTasks.length === 1 ? "tarefa" : "tarefas"}
                </p>
              </div>
            </div>

            {mode === "day" && (
              <div className="p-4">
                <CalendarDayColumn
                  label={cursor.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "2-digit" })}
                  dateKeyValue={dateKey(cursor)}
                  tasks={tasksForKey(groupTasks, dateKey(cursor))}
                  members={members}
                  clients={clients}
                  groupBy={groupBy}
                  handlers={handlers}
                />
              </div>
            )}

            {mode === "week" && (
              <div className="grid gap-3 p-4 lg:grid-cols-7">
                {weekDays.map((day) => (
                  <CalendarDayColumn
                    key={dateKey(day)}
                    label={day.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    dateKeyValue={dateKey(day)}
                    tasks={tasksForKey(groupTasks, dateKey(day))}
                    members={members}
                    clients={clients}
                    groupBy={groupBy}
                    handlers={handlers}
                  />
                ))}
              </div>
            )}

            {mode === "month" && (
              <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-7">
                {monthDays.map((day) => {
                  const dayTasks = tasksForKey(groupTasks, dateKey(day));
                  const muted = day.getMonth() !== cursor.getMonth();
                  return (
                    <div
                      key={dateKey(day)}
                      className={`min-h-28 rounded-lg border border-border bg-background p-2 transition hover:border-primary/40 ${muted ? "opacity-50" : ""}`}
                      onDragOver={(event) => {
                        if (handlers.isManager) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        if (!handlers.isManager) return;
                        event.preventDefault();
                        const taskId = event.dataTransfer.getData("text/task-id");
                        if (taskId) handlers.onMoveDate(taskId, dateKey(day));
                      }}
                    >
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {day.toLocaleDateString("pt-PT", { day: "2-digit", weekday: "short" })}
                        </span>
                        {dayTasks.length > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{dayTasks.length}</span>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {dayTasks.slice(0, 4).map((task) => (
                          <MiniTaskChip key={task.id} task={task} onClick={() => handlers.onEdit(task)} />
                        ))}
                      </ul>
                      {dayTasks.length > 4 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">+{dayTasks.length - 4} tarefas</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {mode === "year" && (
              <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
                {yearMonths.map((month) => {
                  const monthTasks = sortTasks(groupTasks).filter((task) => {
                    const date = taskDate(task);
                    return date && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
                  });
                  return (
                    <div key={month.getMonth()} className="min-h-36 rounded-lg border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold capitalize">
                          {month.toLocaleDateString("pt-PT", { month: "long" })}
                        </h3>
                        <span className="text-xs text-muted-foreground">{monthTasks.length}</span>
                      </div>
                      <ul className="space-y-1">
                        {monthTasks.slice(0, 5).map((task) => (
                          <MiniTaskChip key={task.id} task={task} onClick={() => handlers.onEdit(task)} />
                        ))}
                      </ul>
                      {monthTasks.length === 0 && <p className="text-xs text-muted-foreground">Sem tarefas</p>}
                      {monthTasks.length > 5 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">+{monthTasks.length - 5} tarefas</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CalendarDayColumn({
  label,
  dateKeyValue,
  tasks,
  members,
  clients,
  groupBy,
  handlers,
}: {
  label: string;
  dateKeyValue: string;
  tasks: TaskRow[];
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client";
  handlers: RowHandlers;
}) {
  return (
    <div
      className="min-h-40 rounded-lg border border-border bg-background transition hover:border-primary/40"
      onDragOver={(event) => {
        if (handlers.isManager) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!handlers.isManager) return;
        event.preventDefault();
        const taskId = event.dataTransfer.getData("text/task-id");
        if (taskId) handlers.onMoveDate(taskId, dateKeyValue);
      }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium capitalize">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Sem tarefas</p>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((task) => (
            <CalendarTaskCard
              key={task.id}
              task={task}
              members={members}
              clients={clients}
              groupBy={groupBy}
              {...handlers}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniTaskChip({ task, onClick }: { task: TaskRow; onClick: () => void }) {
  const start = formatWallTime(task.scheduled_for);
  return (
    <button
      type="button"
      draggable={false}
      onClick={onClick}
      className="block w-full truncate rounded-md bg-primary/10 px-2 py-1 text-left text-[11px] font-medium text-primary hover:bg-primary/15"
      title={task.title}
    >
      {start ? `${start} ` : ""}
      {task.title}
    </button>
  );
}

function TaskCalendar({
  tasks,
  members,
  clients,
  groupBy,
  ...handlers
}: RowHandlers & {
  tasks: TaskRow[];
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client";
}) {
  const memberName = (id: string | null) =>
    members.find((m) => m.id === id)?.full_name ?? (id ? id.slice(0, 8) : "Sem responsável");
  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? (id ? id.slice(0, 8) : "Sem cliente");

  const groups = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const key = groupBy === "assignee" ? (task.assigned_to ?? "__unassigned__") : (task.client_id ?? "__no_client__");
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }

  const groupEntries = Array.from(groups.entries()).sort(([a], [b]) => {
    const labelA =
      groupBy === "assignee"
        ? memberName(a === "__unassigned__" ? null : a)
        : clientName(a === "__no_client__" ? null : a);
    const labelB =
      groupBy === "assignee"
        ? memberName(b === "__unassigned__" ? null : b)
        : clientName(b === "__no_client__" ? null : b);
    return labelA.localeCompare(labelB);
  });

  const dayKey = (task: TaskRow) => {
    const daySource = task.scheduled_for ?? task.recurrence_date ?? task.due_at;
    if (!daySource) return "__unscheduled__";
    const date = new Date(daySource);
    if (Number.isNaN(date.getTime())) return "__unscheduled__";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const dayLabel = (key: string) => {
    if (key === "__unscheduled__") return "Sem data";
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("pt-PT", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      {groupEntries.map(([key, groupTasks]) => {
        const title =
          groupBy === "assignee"
            ? memberName(key === "__unassigned__" ? null : key)
            : clientName(key === "__no_client__" ? null : key);
        const byDay = new Map<string, TaskRow[]>();
        for (const task of groupTasks) {
          const keyForDay = dayKey(task);
          const list = byDay.get(keyForDay) ?? [];
          list.push(task);
          byDay.set(keyForDay, list);
        }
        const dayEntries = Array.from(byDay.entries()).sort(([a], [b]) => {
          if (a === "__unscheduled__") return 1;
          if (b === "__unscheduled__") return -1;
          return a.localeCompare(b);
        });

        return (
          <section key={key} className="rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                {groupBy === "assignee" ? <Users className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              </span>
              <div>
                <h2 className="font-display text-base font-semibold">{title}</h2>
                <p className="text-xs text-muted-foreground">
                  {groupTasks.length} {groupTasks.length === 1 ? "tarefa" : "tarefas"}
                </p>
              </div>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {dayEntries.map(([day, dayTasks]) => (
                <div key={day} className="min-h-32 rounded-lg border border-border bg-background">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {dayLabel(day)}
                    </div>
                    <span className="text-xs text-muted-foreground">{dayTasks.length}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {dayTasks
                      .slice()
                      .sort((a, b) =>
                        (a.scheduled_for ?? a.recurrence_date ?? a.due_at ?? "").localeCompare(
                          b.scheduled_for ?? b.recurrence_date ?? b.due_at ?? "",
                        ),
                      )
                      .map((task) => (
                        <CalendarTaskCard
                          key={task.id}
                          task={task}
                          members={members}
                          clients={clients}
                          groupBy={groupBy}
                          {...handlers}
                        />
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarTaskCard({
  task,
  members,
  clients,
  groupBy,
  userId,
  isManager,
  onEdit,
  onEditSeries,
  onReassign,
  onDelete,
  onTransition,
  transitionPending,
}: RowHandlers & {
  task: TaskRow;
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client";
}) {
  const late = isVisuallyLate(task);
  const actions = availableActions(task, { userId, isManager });
  const start = formatWallTime(task.scheduled_for);
  const end = formatWallTime(task.scheduled_end);
  const dateOnly =
    !task.scheduled_for && (task.recurrence_date || task.due_at)
      ? formatWallDate(task.recurrence_date ?? task.due_at)
      : "";
  const memberName = members.find((m) => m.id === task.assigned_to)?.full_name ?? "Sem responsável";
  const clientName = clients.find((c) => c.id === task.client_id)?.name ?? "Sem cliente";

  return (
    <li
      className="space-y-2 px-3 py-3"
      draggable={isManager}
      onDragStart={(event) => {
        if (!isManager) return;
        event.dataTransfer.setData("text/task-id", task.id);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{task.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {start || end ? (
              <span className="font-mono">
                {start || "--:--"} → {end || "--:--"}
              </span>
            ) : dateOnly ? (
              <span>{dateOnly} · Sem horario definido</span>
            ) : (
              <span className="italic">Sem horário definido</span>
            )}
            <span>{groupBy === "assignee" ? clientName : memberName}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[task.status]}`}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {late && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
            <Clock className="h-3 w-3" /> atrasado
          </span>
        )}
        {task.task_group_id && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            title="Tarefa criada em equipe: cada responsável tem a sua própria tarefa, com ponto e conclusão independentes."
          >
            <Users className="h-3 w-3" /> em equipe
          </span>
        )}
      </div>
      {isRefused(task) && (
        <div className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px]">
          <div className="font-semibold uppercase tracking-wide text-destructive">
            Recusada · {members.find((m) => m.id === task.refused_by)?.full_name ?? memberName}
          </div>
          <div>Motivo: {task.refusal_reason || "-"}</div>
        </div>
      )}


      <div className="flex flex-wrap justify-end gap-1">
        {isManager && (
          <>
            <Button size="sm" variant="ghost" title="Editar" onClick={() => onEdit(task)}>
              <Pencil className="h-3 w-3" />
            </Button>
            {task.recurrence_id && (
              <Button size="sm" variant="ghost" title="Editar série" onClick={() => onEditSeries(task)}>
                <Repeat className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" title="Reatribuir" onClick={() => onReassign(task)}>
              <UserCog className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Excluir tarefa"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(task)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
        {actions.map((action) => (
          <ActionButton
            key={action}
            action={action}
            disabled={transitionPending}
            onClick={() => onTransition(task, action)}
          />
        ))}
      </div>
    </li>
  );
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
    nameOf(a === "__unassigned__" ? null : a).localeCompare(nameOf(b === "__unassigned__" ? null : b)),
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
  onArchive,
  transitionPending,
  archivePending,
}: RowHandlers & { task: TaskRow }) {
  const late = isVisuallyLate(t);
  const actions = availableActions(t, { userId, isManager });
  const archived = !!t.archived_at;
  const archivable = canArchive(t);
  const date = formatWallDate(t.scheduled_for ?? t.recurrence_date ?? t.due_at);
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
        {isRefused(t) && (
          <div className="mt-2 space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            <div className="font-semibold uppercase tracking-wide text-destructive">Recusada pelo funcionário</div>
            <div>Motivo: {t.refusal_reason || "-"}</div>
            {t.refused_at && (
              <div className="text-muted-foreground">Recusada em: {formatLocalTime(t.refused_at)}</div>
            )}
            {isManager && (
              <button
                type="button"
                className="mt-1 font-medium text-primary underline underline-offset-2"
                onClick={() => onReassign(t)}
              >
                Reatribuir tarefa
              </button>
            )}
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {date && <span>{date}</span>}
          {start || end ? (
            <span className="font-mono">
              {start || "--:--"} → {end || "--:--"}
            </span>
          ) : (
            !t.scheduled_for && <span className="italic">Sem horário definido</span>
          )}
          {updated && <span>Atualizado: {updated}</span>}
        </div>
        {t.description && <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.description}</div>}
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
            {archived ? (
              <Button
                size="sm"
                variant="ghost"
                title="Desarquivar"
                disabled={archivePending}
                onClick={() => onArchive(t.id, false)}
              >
                <ArchiveRestore className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                title={
                  archivable ? "Arquivar" : "Apenas tarefas concluídas, canceladas ou ausentes podem ser arquivadas"
                }
                disabled={archivePending || !archivable}
                onClick={() => onArchive(t.id, true)}
              >
                <Archive className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
        {actions.map((a) => (
          <ActionButton key={a} action={a} disabled={transitionPending} onClick={() => onTransition(t, a)} />
        ))}
      </div>
    </li>
  );
}

function ActionButton({ action, onClick, disabled }: { action: TaskAction; onClick: () => void; disabled?: boolean }) {
  const map = {
    autorizar: { Icon: ShieldCheck, variant: "outline" as const },
    iniciar: { Icon: Play, variant: "outline" as const },
    concluir: { Icon: Check, variant: "default" as const },
    recusar: { Icon: Ban, variant: "ghost" as const },
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
  formId,
  members,
  clients,
  companyId,
  userId,
  initial,
  onCancel,
  onDone,
  documentsSlot,
}: {
  formId: string;
  members: { id: string; full_name: string | null; email?: string | null }[];
  clients: { id: string; name: string; timing_mode?: "start_stop" | "manual" | null }[];
  companyId: string;
  userId: string;
  initial?: TaskRow;
  onCancel: () => void;
  onDone: () => void;
  documentsSlot?: ReactNode;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignees, setAssignees] = useState<string[]>(initial?.assigned_to ? [initial.assigned_to] : []);
  const assignedTo = assignees[0] ?? "";
  const toggleAssignee = (id: string) => {
    setTouchedAssignees(true);
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const [assigneeQuery, setAssigneeQuery] = useState("");
  const filteredAssignees = useMemo(() => {
    const q = assigneeQuery
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!q.trim()) return members;
    return members.filter((m) => {
      const name = (m.full_name ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const email = (m.email ?? "").toLocaleLowerCase("pt-BR");
      return name.includes(q) || email.includes(q);
    });
  }, [members, assigneeQuery]);
  const [clientId, setClientId] = useState<string>(initial?.client_id ?? "");
  const [priority, setPriority] = useState<"baixa" | "media" | "alta" | "urgente">(initial?.priority ?? "media");
  const [startDate, setStartDate] = useState<string>(
    wallISOToDateInput(initial?.scheduled_for ?? initial?.recurrence_date ?? initial?.due_at),
  );
  const [startTime, setStartTime] = useState<string>(
    initial?.scheduled_for ? formatWallTime(initial.scheduled_for) : "",
  );
  const [endDate, setEndDate] = useState<string>(
    wallISOToDateInput(initial?.scheduled_end ?? initial?.due_at ?? initial?.scheduled_for),
  );
  const [endTime, setEndTime] = useState<string>(initial?.scheduled_end ? formatWallTime(initial.scheduled_end) : "");
  const [graceMinutes, setGraceMinutes] = useState<number>(initial?.absence_grace_minutes ?? 15);
  const [punchMode, setPunchMode] = useState<PunchMode | "">((initial?.punch_mode_override as PunchMode) ?? "");
  const [recurrence, setRecurrence] = useState<RecurrenceFormValue>(emptyRecurrence());
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * ADR-041 — guarda síncrona contra duplo clique/retry. O estado `loading`
   * só reflete no próximo render; o ref bloqueia a segunda submissão já no
   * mesmo tick, antes de qualquer INSERT.
   */
  const submittingRef = useRef(false);

  const timingMode: "start_stop" = "start_stop";

  // ---------------------------------------------------------------
  // Fase B — equipe responsável do cliente (client_assignees).
  // Ao escolher o cliente, sugerimos os colaboradores ativos vinculados.
  // A seleção do Gestor NUNCA é sobrescrita em silêncio: se ele já mexeu,
  // pedimos decisão explícita (usar equipe do novo cliente / manter).
  // ---------------------------------------------------------------
  const [touchedAssignees, setTouchedAssignees] = useState(false);
  const [teamPrompt, setTeamPrompt] = useState<{ clientName: string; team: string[] } | null>(null);
  const [teamHint, setTeamHint] = useState<string | null>(null);

  const fetchClientTeam = async (cid: string): Promise<string[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("client_default_assignees", { _client_id: cid });
    if (error) throw error;
    const rows = (data ?? []) as { user_id: string; is_active: boolean }[];
    // Só colaboradores ativos e que ainda pertencem à empresa (lista `members`).
    const memberIds = new Set(members.map((m) => m.id));
    return rows.filter((r) => r.is_active && memberIds.has(r.user_id)).map((r) => r.user_id);
  };

  const applyClient = async (cid: string) => {
    setClientId(cid);
    setTeamPrompt(null);
    if (initial || !cid) return;
    let team: string[] = [];
    try {
      team = await fetchClientTeam(cid);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    const clientName = clients.find((c) => c.id === cid)?.name ?? "cliente";
    if (team.length === 0) {
      setTeamHint(`${clientName} não tem responsáveis cadastrados. Selecione manualmente.`);
      return;
    }
    if (!touchedAssignees || assignees.length === 0) {
      setAssignees(team);
      setTouchedAssignees(false);
      setTeamHint(
        team.length === 1
          ? `Responsável do cliente carregado automaticamente.`
          : `${team.length} responsáveis do cliente carregados automaticamente.`,
      );
      return;
    }
    setTeamPrompt({ clientName, team });
  };

  const uploadCreationDocs = async (taskId: string) => {
    for (const file of pendingDocs) {
      if (file.size > TASK_DOC_MAX_SIZE) {
        throw new Error(`${file.name}: arquivo maior que 10 MB`);
      }
      if (!TASK_DOC_ALLOWED_MIME.has(file.type)) {
        throw new Error(`${file.name}: tipo de arquivo nao permitido. Use PDF, PNG ou JPG.`);
      }
      const kind = file.type === "application/pdf" ? "pdf" : "image";
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${companyId}/${taskId}/${Date.now()}_${safe}`;
      const up = await supabase.storage.from("task-docs").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("task_documents" as any) as any).insert({
        task_id: taskId,
        company_id: companyId,
        kind,
        title: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (error) throw error;
    }
  };

  return (
    <>
    <ModalBody className="space-y-4">
    <form
      id={formId}
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        // Datas são obrigatórias; horas são opcionais e não criam horário falso.
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if (!startDate || !datePattern.test(startDate)) {
          toast.error("Data de início obrigatória.");
          return;
        }
        if (!endDate || !datePattern.test(endDate)) {
          toast.error("Data de fim obrigatória.");
          return;
        }
        const startISO = startTime ? wallDateTimeToISO(startDate, startTime) : null;
        const endISO = endTime ? wallDateTimeToISO(endDate, endTime) : null;
        const dueISO = endISO ?? wallDateToEndOfDayISO(endDate);
        if (assignees.length === 0) {
          toast.error("Atribua a tarefa a um funcionario antes de salvar.");
          return;
        }
        if (!dueISO) {
          toast.error("Data de fim inválida.");
          return;
        }
        if (startTime && !startISO) {
          toast.error("Hora de início inválida.");
          return;
        }
        if (endTime && !endISO) {
          toast.error("Horário de fim inválido.");
          return;
        }
        if (endDate < startDate) {
          toast.error("A data de fim deve ser igual ou posterior à data de início.");
          return;
        }
        if (startISO && endISO && endISO < startISO) {
          toast.error("O horário de fim deve ser posterior ao de início.");
          return;
        }
        // Conflito com férias aprovadas dos funcionários no período.
        {
          const rangeStart = recurrence.enabled ? recurrence.startDate || startDate : startDate;
          const rangeEnd = recurrence.enabled ? recurrence.endDate || endDate : endDate;
          const { data: vacations } = await supabase
            .from("vacation_requests")
            .select("start_date, end_date, user_id")
            .eq("company_id", companyId)
            .in("user_id", assignees)
            .eq("status", "aprovado")
            .lte("start_date", rangeEnd)
            .gte("end_date", rangeStart);
          if (vacations && vacations.length > 0) {
            const periods = vacations
              .map((v) => {
                const name = members.find((m) => m.id === v.user_id)?.full_name ?? "Funcionário";
                return `${name}: ${v.start_date} → ${v.end_date}`;
              })
              .join(", ");
            const ok = window.confirm(
              `Há férias aprovadas no período (${periods}). Deseja continuar mesmo assim?`,
            );
            if (!ok) return;
          }
        }
        // ADR-041 — segunda submissão (duplo clique/retry) é descartada aqui.
        if (submittingRef.current) return;
        submittingRef.current = true;
        setLoading(true);
        // Título derivado do cliente quando não preenchido manualmente.
        const clientName = clients.find((c) => c.id === clientId)?.name ?? "";
        const finalTitle = title.trim() || clientName.trim() || description.trim().slice(0, 80) || "Tarefa";
        const payload = {
          title: finalTitle,
          description: description.trim() || null,
          assigned_to: assignedTo,
          client_id: clientId || null,
          priority,
          // Wall-clock: preservar o horário exato cadastrado, sem fuso.
          scheduled_for: startISO,
          scheduled_end: endISO,
          due_at: dueISO,
          recurrence_date: startDate,
          absence_grace_minutes: graceMinutes,
          punch_mode_override: punchMode || null,
        };
        let error: { message: string } | null = null;
        const createdTaskIds: string[] = [];
        // Fase B: lote multi-responsável. Cada responsável mantém a SUA tarefa
        // (estado, ponto, recusa e conclusão próprios); o grupo só correlaciona.
        const groupId = assignees.length > 1 ? crypto.randomUUID() : null;
        if (initial) {
          ({ error } = await supabase.from("tasks").update(payload).eq("id", initial.id));
        } else if (recurrence.enabled) {
          // Horario e duracao da recorrencia sao derivados do topo do formulario.
          // Sem horario, a recorrencia fica por dia; nunca materializa 00:00.
          const derivedTime = startTime ? `${startTime}:00` : null;
          let derivedDuration = 0;
          if (startISO && endISO) {
            derivedDuration = Math.max(
              0,
              Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000),
            );
          }
          // Uma série (task_recurrence) por funcionário selecionado.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ins = await (supabase.from("task_recurrences" as any) as any).insert(
            assignees.map((memberId) => ({
              company_id: companyId,
              created_by: userId,
              title: payload.title,
              description: payload.description,
              assigned_to: memberId,
              client_id: payload.client_id,
              priority: payload.priority,
              absence_grace_minutes: payload.absence_grace_minutes,
              punch_mode_override: payload.punch_mode_override,
              frequency: recurrence.frequency,
              // RRULE FREQ=WEEKLY;INTERVAL=n — 2 = "semana sim, semana não" (âncora = start_date).
              interval_weeks: recurrence.frequency === "weekly" ? Math.max(1, recurrence.intervalWeeks || 1) : 1,
              weekdays: recurrence.frequency === "weekly" ? recurrence.weekdays : [],
              monthly_rule: recurrence.frequency === "monthly" ? { day_of_month: recurrence.dayOfMonth } : {},
              start_date: recurrence.startDate,
              end_date: recurrence.endDate || null,
              scheduled_time: derivedTime,
              duration_minutes: derivedDuration,
              task_group_id: groupId,
            })),
          );
          error = ins.error;
          if (!error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)("recurrence_materialize", {
              _days_ahead: 14,
              _company_id: companyId,
            });
          }
        } else {
          // Uma tarefa por funcionário selecionado (tasks.assigned_to segue único).
          const inserted = await supabase
            .from("tasks")
            .insert(
              assignees.map((memberId) => ({
                ...payload,
                assigned_to: memberId,
                company_id: companyId,
                created_by: userId,
                task_group_id: groupId,
              })),
            )
            .select("id")
          ;
          error = inserted.error;
          for (const row of inserted.data ?? []) createdTaskIds.push(row.id);
        }

        if (error) {
          setLoading(false);
          toast.error(error.message);
          return;
        }
        if (!initial && createdTaskIds.length > 0 && pendingDocs.length > 0) {
          try {
            for (const taskId of createdTaskIds) await uploadCreationDocs(taskId);
          } catch (e) {
            setLoading(false);
            toast.error((e as Error).message);
            return;
          }
        }
        setLoading(false);
        toast.success(
          initial ? "Tarefa atualizada" : assignees.length > 1 ? `${assignees.length} tarefas criadas` : "Tarefa criada",
        );
        onDone();
      }}
    >
      <div className="space-y-1.5">
        <Label>Cliente</Label>
        <Select value={clientId} onValueChange={(v) => void applyClient(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {teamPrompt && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
            <p className="font-medium">
              Você já escolheu responsáveis. Usar a equipe padrão de {teamPrompt.clientName} (
              {teamPrompt.team.length}) ou manter a sua seleção?
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setAssignees(teamPrompt.team);
                  setTouchedAssignees(false);
                  setTeamHint("Equipe padrão do novo cliente aplicada.");
                  setTeamPrompt(null);
                }}
              >
                Usar equipe do cliente
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setTeamHint("Seleção manual mantida.");
                  setTeamPrompt(null);
                }}
              >
                Manter seleção atual
              </Button>
            </div>
          </div>
        )}
        {!teamPrompt && teamHint && <p className="text-xs text-muted-foreground">{teamHint}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {!initial && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label htmlFor="task-docs-create">Documentos da tarefa</Label>
              <p className="text-xs text-muted-foreground">PDF, JPG ou PNG ate 10 MB.</p>
            </div>
            <Button type="button" variant="outline" size="sm" asChild>
              <label htmlFor="task-docs-create" className="cursor-pointer">
                <Upload className="mr-1 h-3.5 w-3.5" />
                Anexar
              </label>
            </Button>
          </div>
          <Input
            id="task-docs-create"
            type="file"
            accept={TASK_DOC_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => setPendingDocs(Array.from(e.target.files ?? []))}
          />
          {pendingDocs.length > 0 && (
            <ul className="space-y-1">
              {pendingDocs.map((file) => (
                <li
                  key={`${file.name}-${file.lastModified}`}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="truncate">{file.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Atribuir a</Label>
          {initial ? (
            <Select value={assignedTo} onValueChange={(v) => setAssignees([v])}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name ?? m.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={assigneeQuery}
                  onChange={(e) => setAssigneeQuery(e.target.value)}
                  placeholder="Pesquisar funcionário"
                  aria-label="Pesquisar funcionário"
                  className="h-9 pl-8"
                />
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {members.length === 0 && (
                  <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum funcionário disponível.</p>
                )}
                {filteredAssignees.length === 0 && members.length > 0 && (
                  <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum funcionário encontrado.</p>
                )}
                {filteredAssignees.map((m) => {
                  const checked = assignees.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={() => toggleAssignee(m.id)}
                      />
                      <span className="truncate">{m.full_name ?? m.id.slice(0, 8)}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecione um ou mais funcionários. Cada responsável recebe a sua própria tarefa, com
                estado, ponto, recusa e conclusão independentes — a ação de um não altera a do outro.

              </p>
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Data início</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>
            Hora início <span className="text-xs text-muted-foreground">(opcional)</span>
          </Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Data fim</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>
            Hora fim <span className="text-xs text-muted-foreground">(opcional)</span>
          </Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
          <Select
            value={punchMode || "default"}
            onValueChange={(v) => setPunchMode(v === "default" ? "" : (v as PunchMode))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Padrão da empresa</SelectItem>
              <SelectItem value="automatico">{PUNCH_MODE_LABELS.automatico}</SelectItem>
              <SelectItem value="manual">{PUNCH_MODE_LABELS.manual}</SelectItem>
              <SelectItem value="ambos">{PUNCH_MODE_LABELS.ambos}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {!initial && <RecurrenceForm value={recurrence} onChange={setRecurrence} timingMode={timingMode} />}
    </form>
    {documentsSlot && <div className="border-t border-border pt-4">{documentsSlot}</div>}
    </ModalBody>
    <ModalFooter>
      <Button type="button" variant="outline" disabled={loading} onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} disabled={loading}>
        {loading ? "Salvando..." : initial ? "Salvar alterações" : "Criar tarefa"}
      </Button>
    </ModalFooter>
    </>
  );
}
