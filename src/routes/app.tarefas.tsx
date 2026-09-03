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
  fetchClientSchedule,
  slotsForDate,
  nextDateForSchedule,
  describeSlot,
  type ClientScheduleSlot,
} from "@/lib/tasks/client-schedule";
import {
  addWallMinutes,
  isOvernightTimeRange,
  distributeContractedMinutes,
  formatContractedMinutes,
} from "@/lib/tasks/contracted-hours";
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
  AlertTriangle,
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
  formatStartedLateMinutes,
  isVisuallyLate,
  resolveOperationalStatus,
  startedLateMinutes,
  sweepAbsent,
  transitionTask,
  archiveTask,
  canArchive,
  canMarkAbsent,
  addTaskCompletionNote,
  pauseMinutesNow,
  formatDuration,
  isBulkArchiveEligible,
  isBulkDeleteEligible,
  type TimeEntryRow,
  recordNoStartReason,
  checkTaskScheduleConflicts,
  type TaskScheduleConflict,
  previewRecurrenceDates,
} from "@/lib/tasks";

import { RecurrenceForm, emptyRecurrence, type RecurrenceFormValue } from "@/components/tasks/RecurrenceForm";
import { TaskDocuments } from "@/components/tasks/TaskDocuments";
import { ReassignDialog } from "@/components/tasks/ReassignDialog";
import { EditRecurrenceDialog } from "@/components/tasks/EditRecurrenceDialog";
import type { RecurrenceRow } from "@/lib/tasks";
import { isRefused } from "@/lib/tasks";
import { localDateToDateKey, normalizeCustomRecurrenceDates } from "@/lib/tasks/custom-recurrence";
import { CancelTaskDialog } from "@/components/tasks/CancelTaskDialog";
import { DeleteRecurrenceDialog } from "@/components/tasks/DeleteRecurrenceDialog";
import { MarkAbsentDialog } from "@/components/tasks/MarkAbsentDialog";
import {
  OpenPunchRecoveryDialog,
  type RecoveryEntry,
} from "@/components/ponto/OpenPunchRecoveryDialog";
import { fetchOpenEntries, fetchOpenEntrySelf } from "@/lib/punch/recovery";
import {
  currentTaskCancellation,
  currentTaskRefusal,
  groupTaskRefusals,
  type TaskRefusalRecord,
} from "@/lib/task-refusal-view";


import { EmployeeMultiPicker } from "@/components/common/EmployeePicker";
import { filterCalendarData } from "@/lib/tasks/calendar-filter";
import { isDashboardCancelled, isDashboardLateStart } from "@/lib/tasks/dashboard-rules";
import {
  wallISOToDateInput,
  wallDateToEndOfDayISO,
  wallDateTimeToISO,
  formatWallDate,
  formatWallTime,
  formatLocalTime,
} from "@/lib/wall-clock";

// Filtros aceitos via search-params. `atrasadas` e `canceladas` são filtros
// derivados e compartilham as regras canônicas do dashboard.
const STATUS_FILTERS = [
  "pendente",
  "autorizado",
  "em_andamento",
  "concluido",
  "cancelado",
  "ausente",
  "atrasadas",
  "canceladas",
  "recusadas",
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];
type TasksSearch = { status?: StatusFilter; employee?: string; client?: string; task?: string };
type ClientOption = {
  id: string;
  name: string;
  timing_mode?: "start_stop" | "manual" | null;
  contracted_minutes?: number | null;
};
type CompletionNote = {
  id: string;
  task_id: string;
  actor_user_id: string;
  created_at: string;
  reason: string | null;
};
type ApprovedVacation = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: "aprovado";
};
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
  const { user, profile, isManager, currentCompanyId } = useAuth();
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
  // ADR-044 — registo formal de falta pelo gestor (motivo obrigatório).
  const [absenceTarget, setAbsenceTarget] = useState<TaskRow | null>(null);
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const [completionNote, setCompletionNote] = useState("");

  // ADR-036 — cancelamento sempre com motivo obrigatório e auditado.
  const [cancelling, setCancelling] = useState<TaskRow | null>(null);
  // SUP-2026-000074 — ponto esquecido bloqueia a conclusão: regularizar + concluir.
  const [recovering, setRecovering] = useState<RecoveryEntry | null>(null);
  const [refusalReason, setRefusalReason] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [taskView, setTaskView] = useState<"list" | "calendar">("list");
  const [calendarGroup, setCalendarGroup] = useState<"assignee" | "client">("assignee");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"archive" | "delete" | null>(null);
  const [noStartTarget, setNoStartTarget] = useState<TaskRow | null>(null);
  const [noStartReason, setNoStartReason] = useState("");

  const selectedEmployeeIds = useMemo(
    () => (search.employee ? search.employee.split(",").filter(Boolean) : []),
    [search.employee],
  );

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
    queryKey: ["tasks", currentCompanyId, user?.id, isManager, view, search.task],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      // O contexto da empresa faz parte da identidade da consulta. Sem este
      // filtro, uma sessão com mais de uma empresa podia carregar tarefas de
      // outro contexto enquanto o AuthContext ainda era inicializado.
      if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      if (!isManager) q = q.eq("assigned_to", user!.id);
      if (search.task) q = q.eq("id", search.task);
      else if (view === "archived") q = q.not("archived_at", "is", null);
      else q = q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
    enabled: !!user && !!currentCompanyId,
    refetchOnWindowFocus: true,
  });

  // Uma consulta única vincula o ponto mais recente a cada tarefa exibida.
  // A pausa continua sendo lida de time_entries, sem duplicar dados em tasks.
  const taskIds = useMemo(() => (tasks ?? []).map((task) => task.id), [tasks]);
  const { data: taskPunches } = useQuery({
    queryKey: ["task-punches", currentCompanyId, taskIds],
    queryFn: async (): Promise<TimeEntryRow[]> => {
      if (!currentCompanyId || taskIds.length === 0) return [];
      const { data, error } = await supabase
        .from("time_entries")
        .select("id,company_id,task_id,user_id,started_at,paused_at,resumed_at,ended_at,effective_minutes,notes,created_at,updated_at")
        .eq("company_id", currentCompanyId)
        .in("task_id", taskIds)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TimeEntryRow[];
    },
    enabled: !!user && !!currentCompanyId && tasks !== undefined,
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
        .select("id,name,timing_mode,contracted_minutes")
        .eq("company_id", currentCompanyId)
        .eq("status", "ativo")
        .order("name", { ascending: true });
      if (error) return [] as ClientOption[];
      return (data ?? []) as unknown as ClientOption[];
    },
    enabled: !!currentCompanyId,
  });

  const { data: approvedVacations } = useQuery({
    queryKey: ["approved-vacations-calendar", currentCompanyId, user?.id, isManager],
    queryFn: async () => {
      if (!currentCompanyId) return [] as ApprovedVacation[];
      let q = supabase
        .from("vacation_requests")
        .select("id,user_id,start_date,end_date,status")
        .eq("company_id", currentCompanyId)
        .eq("status", "aprovado")
        .order("start_date", { ascending: true });
      if (!isManager) q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ApprovedVacation[];
    },
    enabled: !!user?.id && !!currentCompanyId,
  });

  const { data: completionNotes } = useQuery({
    queryKey: ["task-completion-notes", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [] as CompletionNote[];
      const { data, error } = await (supabase.from("task_audit_events" as never) as any)
        .select("id,task_id,actor_user_id,created_at,reason")
        .eq("company_id", currentCompanyId)
        .eq("event", "completion_note")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompletionNote[];
    },
    enabled: !!user && !!currentCompanyId,
  });

  const { data: taskRefusals } = useQuery({
    queryKey: ["task-refusals", currentCompanyId, user?.id, isManager],
    queryFn: async () => {
      if (!currentCompanyId || !user?.id) return [] as TaskRefusalRecord[];
      let q = supabase
        .from("task_refusals")
        .select("id,company_id,task_id,employee_id,actor_id,reason,previous_status,new_status,created_at")
        .eq("company_id", currentCompanyId)
        .order("created_at", { ascending: false });
      if (!isManager) q = q.eq("employee_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TaskRefusalRecord[];
    },
    enabled: !!user?.id && !!currentCompanyId,
  });

  const completionNoteByTask = useMemo(() => {
    const map = new Map<string, CompletionNote>();
    for (const note of completionNotes ?? []) if (!map.has(note.task_id)) map.set(note.task_id, note);
    return map;
  }, [completionNotes]);

  const refusalsByTask = useMemo(() => groupTaskRefusals(taskRefusals ?? []), [taskRefusals]);
  const memberNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const member of members ?? []) {
      if (member.full_name?.trim()) names.set(member.id, member.full_name.trim());
    }
    if (user?.id && profile?.full_name?.trim()) names.set(user.id, profile.full_name.trim());
    return names as ReadonlyMap<string, string>;
  }, [members, profile?.full_name, user?.id]);

  /**
   * SUP-2026-000074 — pontos ainda em aberto (esquecimento de saída).
   * Gestor vê os da empresa; funcionário apenas o seu.
   */
  const { data: openPunches } = useQuery({
    queryKey: ["tasks-open-punches", currentCompanyId, user?.id, isManager],
    queryFn: async (): Promise<RecoveryEntry[]> => {
      if (isManager) {
        const rows = await fetchOpenEntries(currentCompanyId);
        return rows.map((r) => ({
          time_entry_id: r.time_entry_id,
          task_id: r.task_id,
          task_title: r.task_title,
          task_status: r.task_status,
          client_name: r.client_name,
          company_name: r.company_name,
          started_at: r.started_at,
          notes: r.notes,
          user_name: r.user_name,
        }));
      }
      const self = await fetchOpenEntrySelf();
      if (!self) return [];
      return [
        {
          time_entry_id: self.time_entry_id,
          task_id: self.task_id,
          task_title: self.task_title,
          task_status: self.task_status,
          client_name: self.client_name,
          company_name: self.company_name,
          started_at: self.started_at,
          notes: self.notes,
        },
      ];
    },
    enabled: !!user,
  });

  const openPunchByTask = useMemo(() => {
    const map = new Map<string, RecoveryEntry>();
    for (const e of openPunches ?? []) if (e.task_id) map.set(e.task_id, e);
    return map;
  }, [openPunches]);

  const taskPunchByTask = useMemo(() => {
    const map = new Map<string, TimeEntryRow>();
    for (const entry of taskPunches ?? []) {
      if (!entry.task_id) continue;
      const previous = map.get(entry.task_id);
      const entryIsOpen = !entry.ended_at;
      const previousIsOpen = previous ? !previous.ended_at : false;
      if (!previous || (entryIsOpen && !previousIsOpen) || entry.started_at > previous.started_at) {
        map.set(entry.task_id, entry);
      }
    }
    return map;
  }, [taskPunches]);

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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_refusals" }, () =>
        qc.invalidateQueries({ queryKey: ["task-refusals"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, () =>
        qc.invalidateQueries({ queryKey: ["task-punches"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "vacation_requests" }, () =>
        qc.invalidateQueries({ queryKey: ["approved-vacations-calendar"] }),
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
      qc.invalidateQueries({ queryKey: ["tasks-open-punches"] });
      qc.invalidateQueries({ queryKey: ["task-refusals"] });
      toast.success("Tarefa atualizada");
      setRefusing(null);
      setRefusalReason("");
    },
    onError: (e: Error, vars) => {
      // SUP-2026-000074 — ponto esquecido: oferecer regularização em vez de erro seco.
      const entry = openPunchByTask.get(vars.id);
      if (entry && /ponto/i.test(e.message)) {
        setRecovering(entry);
        return;
      }
      toast.error(e.message);
    },
  });

  const completeTask = useMutation({
    mutationFn: async ({ taskId, note }: { taskId: string; note: string }) => {
      const task = await transitionTask(taskId, "concluir");
      let noteSaved = true;
      if (note.trim()) {
        try {
          await addTaskCompletionNote(taskId, note);
        } catch (error) {
          noteSaved = false;
          console.error("[task-completion-note] failed after task completion", { taskId, error });
        }
      }
      return { task, noteSaved };
    },
    onSuccess: ({ noteSaved }) => {
      setCompleting(null);
      setCompletionNote("");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task-completion-notes"] });
      if (noteSaved) toast.success("Tarefa concluída");
      else toast.warning("Tarefa concluída, mas a observação não foi salva.");
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

  const bulkActionMut = useMutation({
    mutationFn: async ({ action, tasks: targets }: { action: "archive" | "delete"; tasks: TaskRow[] }) => {
      const failed: string[] = [];
      for (const task of targets) {
        try {
          if (action === "archive") await archiveTask(task.id, true);
          else {
            // A mesma RPC canônica da exclusão individual mantém auditoria e soft delete.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.rpc as any)("task_soft_delete", { _task_id: task.id });
            if (error) throw error;
          }
        } catch {
          failed.push(task.id);
        }
      }
      if (failed.length > 0) throw new Error(`${failed.length} tarefa(s) não puderam ser processadas.`);
      return targets.length;
    },
    onSuccess: (_count, vars) => {
      setSelectedTaskIds([]);
      setBulkAction(null);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(vars.action === "archive" ? "Tarefas arquivadas" : "Tarefas excluídas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noStartMut = useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) => recordNoStartReason(taskId, reason),
    onSuccess: () => {
      setNoStartTarget(null);
      setNoStartReason("");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["punch-admin-list"] });
      toast.success("Motivo registado");
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
      const endDateKey = isOvernightTimeRange(startTime, endTime)
        ? addWallMinutes(dateKey, "00:00", 24 * 60)?.date ?? dateKey
        : dateKey;
      const scheduledEnd = endTime ? wallDateTimeToISO(endDateKey, endTime) : null;
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
    if (action === "marcar_ausente") {
      setAbsenceTarget(task);
      return;
    }

    // SUP-2026-000074 — concluir tarefa cujo ponto ficou aberto por esquecimento
    // exige hora real de saída + motivo (nunca fechar silenciosamente em now()).
    if (action === "concluir") {
      const entry = openPunchByTask.get(task.id);
      if (entry) {
        const startedDay = formatWallDate(entry.started_at);
        const today = formatWallDate(new Date().toISOString());
        const isOtherUser = isManager && task.assigned_to !== user?.id;
        if (startedDay !== today || isOtherUser) {
          setRecovering(entry);
          return;
        }
      }
      setCompletionNote("");
      setCompleting(task);
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
    const selectedEmployees = new Set(selectedEmployeeIds);
    return all.filter((t) => {
      if (search.task && t.id !== search.task) return false;
      if (selectedEmployees.size > 0 && (!t.assigned_to || !selectedEmployees.has(t.assigned_to))) return false;
      if (search.client && t.client_id !== search.client) return false;
      if (!search.status) return true;
      if (search.status === "atrasadas") {
        return isDashboardLateStart(t);
      }
      if (search.status === "canceladas") {
        return isDashboardCancelled(t);
      }
      if (search.status === "recusadas") {
        return isRefused(t);
      }
      if (search.status === "pendente") {
        return t.status === "pendente" && !isDashboardLateStart(t);
      }
      return t.status === search.status;
    });
  }, [tasks, search.status, search.employee, search.client, search.task, selectedEmployeeIds]);

  const filteredCalendarData = useMemo(
    () => filterCalendarData(filteredTasks, approvedVacations ?? [], selectedEmployeeIds),
    [filteredTasks, approvedVacations, selectedEmployeeIds],
  );

  const selectedTasks = useMemo(
    () => (tasks ?? []).filter((task) => selectedTaskIds.includes(task.id)),
    [tasks, selectedTaskIds],
  );
  const bulkArchiveTasks = useMemo(() => selectedTasks.filter(isBulkArchiveEligible), [selectedTasks]);
  const bulkDeleteTasks = useMemo(() => selectedTasks.filter(isBulkDeleteEligible), [selectedTasks]);
  const selectableTaskIds = useMemo(() => filteredTasks.map((task) => task.id), [filteredTasks]);
  const allSelectableTasksSelected =
    selectableTaskIds.length > 0 && selectableTaskIds.every((id) => selectedTaskIds.includes(id));
  const toggleAllVisibleTasks = () => {
    setSelectedTaskIds((current) => {
      if (allSelectableTasksSelected) return current.filter((id) => !selectableTaskIds.includes(id));
      return Array.from(new Set([...current, ...selectableTaskIds]));
    });
  };

  // Contador de recusas pendentes de decisão do gestor (SUP-2026-000077).
  const refusedCount = useMemo(() => (tasks ?? []).filter((t) => isRefused(t)).length, [tasks]);


  const setStatusFilter = (next: StatusFilter | undefined) => {
    void navigate({
      search: (prev: TasksSearch) => ({ ...prev, status: next }),
      replace: true,
    });
  };
  const setEmployeeFilter = (next: string[] | undefined) => {
    void navigate({
      search: (prev: TasksSearch) => ({ ...prev, employee: next?.length ? next.join(",") : undefined }),
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

      {/* ADR-051 — tarefa de série: escolher entre "apenas esta" e "esta e futuras". */}
      <DeleteRecurrenceDialog
        task={deleting?.recurrence_id ? deleting : null}
        clientName={deleting?.client_id ? clientsList?.find((c) => c.id === deleting.client_id)?.name : undefined}
        open={!!deleting?.recurrence_id}
        onOpenChange={(o) => !o && setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["recurrences"] });
          qc.invalidateQueries({ queryKey: ["notifications"] });
        }}
      />

      <AlertDialog
        open={!!deleting && !deleting.recurrence_id}
        onOpenChange={(v) => !v && !deleteTask.isPending && setDeleting(null)}
      >
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

      <AlertDialog open={!!bulkAction} onOpenChange={(open) => !open && !bulkActionMut.isPending && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkAction === "archive" ? "Arquivar tarefas selecionadas?" : "Excluir tarefas selecionadas?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "archive"
                ? `${bulkArchiveTasks.length} tarefa(s) única(s) serão arquivadas. Recorrências não participam desta ação.`
                : `${bulkDeleteTasks.length} tarefa(s) única(s) serão excluídas pelo fluxo seguro existente. Recorrências não participam desta ação.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActionMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkActionMut.isPending || (bulkAction === "archive" ? bulkArchiveTasks.length === 0 : bulkDeleteTasks.length === 0)}
              onClick={(event) => {
                event.preventDefault();
                if (bulkAction === "archive") bulkActionMut.mutate({ action: "archive", tasks: bulkArchiveTasks });
                if (bulkAction === "delete") bulkActionMut.mutate({ action: "delete", tasks: bulkDeleteTasks });
              }}
            >
              {bulkActionMut.isPending ? "Processando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!noStartTarget} onOpenChange={(open) => !open && !noStartMut.isPending && setNoStartTarget(null)}>
        <DialogContent size="sm">
          <ModalHeader icon={FileText} title="Motivo de não ter iniciado" description="Registe uma justificativa operacional sem criar ponto ou horário fictício." />
          <ModalBody>
            <Label htmlFor="no-start-reason">Motivo</Label>
            <Textarea id="no-start-reason" value={noStartReason} onChange={(event) => setNoStartReason(event.target.value)} placeholder="Ex.: Estava sem internet." className="mt-2 min-h-28" />
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setNoStartTarget(null)} disabled={noStartMut.isPending}>Cancelar</Button>
            <Button type="button" onClick={() => noStartTarget && noStartMut.mutate({ taskId: noStartTarget.id, reason: noStartReason })} disabled={noStartMut.isPending || !noStartReason.trim()}>
              {noStartMut.isPending ? "Salvando..." : "Salvar motivo"}
            </Button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

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

      <MarkAbsentDialog
        task={absenceTarget}
        employeeName={
          absenceTarget?.assigned_to
            ? ((members ?? []).find((m) => m.id === absenceTarget.assigned_to)?.full_name ?? undefined)
            : undefined
        }
        clientName={
          absenceTarget?.client_id ? clientsList?.find((c) => c.id === absenceTarget.client_id)?.name : undefined
        }
        open={!!absenceTarget}
        onOpenChange={(o) => !o && setAbsenceTarget(null)}
        onDone={() => {
          setAbsenceTarget(null);
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />

      {/* SUP-2026-000074 — regularizar ponto esquecido e concluir a tarefa. */}
      <OpenPunchRecoveryDialog
        open={!!recovering}
        onOpenChange={(o) => !o && setRecovering(null)}
        mode={isManager ? "manager" : "employee"}
        entry={recovering}
        completeTask
        onResolved={() => {
          setRecovering(null);
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["tasks-open-punches"] });
          qc.invalidateQueries({ queryKey: ["notifications"] });
        }}
      />

      <Dialog
        open={!!completing}
        onOpenChange={(value) => {
          if (!value && !completeTask.isPending) {
            setCompleting(null);
            setCompletionNote("");
          }
        }}
      >
        <DialogContent size="sm">
          <ModalHeader icon={Check} title="Concluir tarefa" description="Registre uma observação opcional sobre a conclusão." />
          <ModalBody>
            <form
              id="task-completion-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!completing) return;
                completeTask.mutate({ taskId: completing.id, note: completionNote });
              }}
            >
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                {completing?.title}
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-completion-note">Observação da conclusão (opcional)</Label>
                <Textarea
                  id="task-completion-note"
                  value={completionNote}
                  onChange={(event) => setCompletionNote(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Ex.: cliente solicitou algo adicional, houve algum problema, material em falta..."
                />
              </div>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" disabled={completeTask.isPending} onClick={() => setCompleting(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="task-completion-form" disabled={completeTask.isPending}>
              <Check className="mr-2 h-4 w-4" />
              {completeTask.isPending ? "Concluindo..." : "Concluir tarefa"}
            </Button>
          </ModalFooter>
        </DialogContent>
      </Dialog>



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
                ["canceladas", "Canceladas"],
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
            <EmployeeMultiPicker
              employees={(members ?? []).map((m) => ({
                id: m.id,
                full_name: m.full_name,
                job_title: (m as { job_title?: string | null }).job_title ?? null,
              }))}
              values={selectedEmployeeIds}
              onValuesChange={setEmployeeFilter}
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
            {selectedEmployeeIds.length > 0 && (
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
      {isManager && selectedTaskIds.length > 0 && (
        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="mr-auto text-sm font-medium">{selectedTaskIds.length} tarefa(s) selecionada(s)</span>
          <Button
            variant="outline"
            disabled={bulkArchiveTasks.length === 0 || bulkActionMut.isPending}
            onClick={() => setBulkAction("archive")}
            title="Somente tarefas únicas em estado terminal podem ser arquivadas"
          >
            <Archive className="mr-2 h-4 w-4" /> Arquivar selecionadas
          </Button>
          <Button
            variant="destructive"
            disabled={bulkDeleteTasks.length === 0 || bulkActionMut.isPending}
            onClick={() => setBulkAction("delete")}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Excluir selecionadas
          </Button>
        </section>
      )}
      {isManager && filteredTasks.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allSelectableTasksSelected}
              onChange={toggleAllVisibleTasks}
              aria-label="Selecionar todas as tarefas visíveis"
              className="h-4 w-4 accent-primary"
            />
            Selecionar tarefas visíveis
          </label>
          <span className="text-xs text-muted-foreground">
            {selectedTaskIds.length > 0 ? `${selectedTaskIds.length} selecionada(s)` : "Nenhuma selecionada"}
          </span>
          {selectedTaskIds.length > 0 && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelectedTaskIds([])}>
              Limpar seleção
            </Button>
          )}
        </section>
      )}

      {!isLoading && filteredTasks.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          {view === "archived"
            ? "Nenhuma tarefa arquivada."
            : search.status || selectedEmployeeIds.length > 0 || search.client
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
          completionNotes={completionNoteByTask}
          refusalsByTask={refusalsByTask}
          memberNames={memberNames}
           selectedTaskIds={new Set(selectedTaskIds)}
           taskPunches={taskPunchByTask}
          onToggleTaskSelection={(id) => setSelectedTaskIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])}
          onNoStartReason={setNoStartTarget}
         />
      )}

      {!isLoading &&
        (filteredCalendarData.tasks.length > 0 || filteredCalendarData.vacations.length > 0) &&
        isManager &&
        taskView === "calendar" && (
        <TaskPlanningCalendar
          tasks={filteredCalendarData.tasks}
          vacations={filteredCalendarData.vacations}
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
           completionNotes={completionNoteByTask}
           refusalsByTask={refusalsByTask}
           memberNames={memberNames}
          selectedTaskIds={new Set(selectedTaskIds)}
          taskPunches={taskPunchByTask}
           onToggleTaskSelection={(id) => setSelectedTaskIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])}
           onNoStartReason={setNoStartTarget}
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
                 completionNotes={completionNoteByTask}
                 refusalsByTask={refusalsByTask}
                 memberNames={memberNames}
                 selectedTaskIds={new Set(selectedTaskIds)}
                 taskPunches={taskPunchByTask}
                 onToggleTaskSelection={(id) => setSelectedTaskIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])}
                 onNoStartReason={setNoStartTarget}
               />
            ))}
          </ul>
        </div>
      )}

      {!isLoading &&
        (filteredCalendarData.tasks.length > 0 || filteredCalendarData.vacations.length > 0) &&
        !isManager &&
        taskView === "calendar" && (
        <TaskPlanningCalendar
          tasks={filteredCalendarData.tasks}
          vacations={filteredCalendarData.vacations}
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
          completionNotes={completionNoteByTask}
          refusalsByTask={refusalsByTask}
          memberNames={memberNames}
           selectedTaskIds={new Set(selectedTaskIds)}
           taskPunches={taskPunchByTask}
          onToggleTaskSelection={(id) => setSelectedTaskIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])}
          onNoStartReason={setNoStartTarget}
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
  completionNotes: ReadonlyMap<string, CompletionNote>;
  refusalsByTask: ReadonlyMap<string, TaskRefusalRecord[]>;
  memberNames: ReadonlyMap<string, string>;
  taskPunches: ReadonlyMap<string, TimeEntryRow>;
  selectedTaskIds?: ReadonlySet<string>;
  onToggleTaskSelection?: (taskId: string) => void;
  onNoStartReason?: (task: TaskRow) => void;
}

function TaskPlanningCalendar({
  tasks,
  vacations,
  members,
  clients,
  groupBy,
  ...handlers
}: RowHandlers & {
  tasks: TaskRow[];
  vacations: ApprovedVacation[];
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
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const taskDateKey = (task: TaskRow) => {
    const source = task.scheduled_for ?? task.recurrence_date ?? task.due_at;
    return wallISOToDateInput(source) || null;
  };
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
      return taskDateKey(task) === key;
    });
  const vacationsForKey = (list: ApprovedVacation[], key: string) =>
    list.filter((vacation) => vacation.start_date <= key && vacation.end_date >= key);
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
  for (const vacation of vacations) {
    const key = groupBy === "assignee" ? vacation.user_id : "__no_client__";
    if (!groups.has(key)) groups.set(key, []);
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
        const groupVacations =
          groupBy === "assignee"
            ? vacations.filter((vacation) => vacation.user_id === key)
            : key === "__no_client__"
              ? vacations
              : [];
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
                  {groupVacations.length > 0 && ` · ${groupVacations.length} período(s) de férias`}
                </p>
              </div>
            </div>

            {mode === "day" && (
              <div className="p-4">
                <CalendarDayColumn
                  label={cursor.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "2-digit" })}
                  dateKeyValue={dateKey(cursor)}
                  tasks={tasksForKey(groupTasks, dateKey(cursor))}
                  vacations={vacationsForKey(groupVacations, dateKey(cursor))}
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
                    vacations={vacationsForKey(groupVacations, dateKey(day))}
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
                  const dayVacations = vacationsForKey(groupVacations, dateKey(day));
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
                        {dayTasks.length + dayVacations.length > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                            {dayTasks.length + dayVacations.length}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {dayTasks.slice(0, 4).map((task) => (
                          <MiniTaskChip key={task.id} task={task} onClick={() => handlers.onEdit(task)} />
                        ))}
                        {dayVacations.map((vacation) => (
                          <MiniVacationChip key={vacation.id} vacation={vacation} />
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
                  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
                  const monthTasks = sortTasks(groupTasks).filter((task) => taskDateKey(task)?.slice(0, 7) === monthKey);
                  const monthVacations = groupVacations.filter(
                    (vacation) => vacation.start_date.slice(0, 7) <= monthKey && vacation.end_date.slice(0, 7) >= monthKey,
                  );
                  return (
                    <div key={month.getMonth()} className="min-h-36 rounded-lg border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold capitalize">
                          {month.toLocaleDateString("pt-PT", { month: "long" })}
                        </h3>
                        <span className="text-xs text-muted-foreground">{monthTasks.length + monthVacations.length}</span>
                      </div>
                      <ul className="space-y-1">
                        {monthTasks.slice(0, 5).map((task) => (
                          <MiniTaskChip key={task.id} task={task} onClick={() => handlers.onEdit(task)} />
                        ))}
                        {monthVacations.slice(0, 5).map((vacation) => (
                          <MiniVacationChip key={vacation.id} vacation={vacation} />
                        ))}
                      </ul>
                      {monthTasks.length === 0 && monthVacations.length === 0 && (
                        <p className="text-xs text-muted-foreground">Sem tarefas ou férias</p>
                      )}
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
  vacations,
  members,
  clients,
  groupBy,
  handlers,
}: {
  label: string;
  dateKeyValue: string;
  tasks: TaskRow[];
  vacations: ApprovedVacation[];
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
        <span className="text-xs text-muted-foreground">{tasks.length + vacations.length}</span>
      </div>
      {tasks.length === 0 && vacations.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Sem tarefas ou férias</p>
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
          {vacations.map((vacation) => (
            <CalendarVacationCard key={vacation.id} vacation={vacation} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniTaskChip({ task, onClick }: { task: TaskRow; onClick: () => void }) {
  const start = formatWallTime(task.scheduled_for);
  const lateMinutes = startedLateMinutes(task);
  return (
    <button
      type="button"
      draggable={false}
      onClick={onClick}
      className="block w-full truncate rounded-md bg-primary/10 px-2 py-1 text-left text-[11px] font-medium text-primary hover:bg-primary/15"
      title={lateMinutes != null ? `${task.title} · Início com atraso · ${formatStartedLateMinutes(lateMinutes)}` : task.title}
    >
      {start ? `${start} ` : ""}
      {task.title}
    </button>
  );
}

function MiniVacationChip({ vacation }: { vacation: ApprovedVacation }) {
  return (
    <li
      className="truncate rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-left text-[11px] font-medium text-emerald-700"
      title={`Férias aprovadas · ${vacation.start_date} → ${vacation.end_date}`}
    >
      Férias · Aprovadas
    </li>
  );
}

function CalendarVacationCard({ vacation }: { vacation: ApprovedVacation }) {
  const start = formatWallDate(vacation.start_date) || vacation.start_date;
  const end = formatWallDate(vacation.end_date) || vacation.end_date;
  return (
    <li className="space-y-1 border-l-2 border-emerald-500 bg-emerald-50/70 px-3 py-3 text-emerald-800">
      <div className="text-sm font-semibold">Férias</div>
      <div className="text-xs">{start} → {end}</div>
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
        Aprovadas
      </span>
    </li>
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
    return wallISOToDateInput(daySource) || "__unscheduled__";
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
  refusalsByTask,
  memberNames,
  selectedTaskIds,
  onToggleTaskSelection,
  onNoStartReason,
  taskPunches,
}: RowHandlers & {
  task: TaskRow;
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client";
}) {
  const late = isVisuallyLate(task);
  const lateStartMinutes = startedLateMinutes(task);
  const operationalStatus = resolveOperationalStatus(task);
  const actions = availableActions(task, { userId, isManager });
  const start = formatWallTime(task.scheduled_for);
  const end = formatWallTime(task.scheduled_end);
  const dateOnly =
    !task.scheduled_for && (task.recurrence_date || task.due_at)
      ? formatWallDate(task.recurrence_date ?? task.due_at)
      : "";
  const memberName = members.find((m) => m.id === task.assigned_to)?.full_name ?? "Sem responsável";
  const clientName = clients.find((c) => c.id === task.client_id)?.name ?? "Sem cliente";
  const taskPunch = taskPunches.get(task.id);
  const refusalHistory = refusalsByTask.get(task.id) ?? [];
  const refusal = currentTaskRefusal(task, refusalHistory);
  const cancellation = currentTaskCancellation(task);

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
        <div className="flex min-w-0 items-start gap-2">
          {isManager && onToggleTaskSelection && (
            <input
              type="checkbox"
              aria-label={`Selecionar tarefa ${task.title}`}
              checked={selectedTaskIds?.has(task.id) ?? false}
              onChange={() => onToggleTaskSelection(task.id)}
              className="mt-1 h-4 w-4 accent-primary"
            />
          )}
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
            {taskPunch && <PauseSummary entry={taskPunch} />}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${operationalStatus === "atrasada" ? "bg-destructive/15 text-destructive" : STATUS_TONE[operationalStatus]}`}>
          {operationalStatus === "atrasada" ? "Atrasada" : STATUS_LABELS[operationalStatus]}
        </span>
      </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {lateStartMinutes != null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
            <Clock className="h-3 w-3" /> Início com atraso · {formatStartedLateMinutes(lateStartMinutes)}
          </span>
        ) : late && operationalStatus !== "atrasada" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
            <Clock className="h-3 w-3" /> atrasado
          </span>
        ) : null}
        {task.task_group_id && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            title="Tarefa criada em equipe: cada responsável tem a sua própria tarefa, com ponto e conclusão independentes."
          >
            <Users className="h-3 w-3" /> em equipe
          </span>
        )}
      </div>
      {refusal && (
        <div className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px]">
          <div className="font-semibold uppercase tracking-wide text-destructive">
            Recusada · {memberNames.get(refusal.employeeId) ?? memberName}
          </div>
          <div className="whitespace-pre-wrap break-words">Motivo: {refusal.reason ?? "Motivo não registrado"}</div>
          {refusal.refusedAt && (
            <div className="text-muted-foreground">Recusada em: {formatLocalTime(refusal.refusedAt)}</div>
          )}
        </div>
      )}
      {cancellation && (
        <div className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px]">
          <div className="font-semibold uppercase tracking-wide text-destructive">
            {cancellation.byEmployee ? "Cancelada pelo funcionário" : "Tarefa cancelada"}
          </div>
          <div className="whitespace-pre-wrap break-words">
            Motivo: {cancellation.reason ?? "Motivo não registrado"}
          </div>
          {cancellation.cancelledAt && (
            <div className="text-muted-foreground">Cancelada em: {formatLocalTime(cancellation.cancelledAt)}</div>
          )}
        </div>
      )}
      <TaskRefusalHistory records={refusalHistory} memberNames={memberNames} compact />


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
        {onNoStartReason && (task.status === "pendente" || task.status === "autorizado") && late && (
          <Button size="sm" variant="ghost" title="Registar motivo de não ter iniciado" onClick={() => onNoStartReason(task)}>
            <FileText className="h-3 w-3" />
            <span className="ml-1 hidden sm:inline">Motivo</span>
          </Button>
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

function TaskRefusalHistory({
  records,
  memberNames,
  compact = false,
}: {
  records: readonly TaskRefusalRecord[];
  memberNames: ReadonlyMap<string, string>;
  compact?: boolean;
}) {
  if (records.length === 0) return null;

  return (
    <details className={compact ? "text-[11px]" : "mt-2 text-xs"}>
      <summary className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline">
        Histórico de recusas ({records.length})
      </summary>
      <div className="mt-2 space-y-2 border-l-2 border-destructive/25 pl-3">
        {records.map((record) => (
          <div key={record.id} className="space-y-0.5">
            <div className="font-medium text-foreground">
              {memberNames.get(record.employee_id) ?? "Funcionário"} · {formatLocalTime(record.created_at)}
            </div>
            <div className="whitespace-pre-wrap break-words text-muted-foreground">{record.reason}</div>
          </div>
        ))}
      </div>
    </details>
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
  completionNotes,
  refusalsByTask,
  memberNames,
  selectedTaskIds,
  onToggleTaskSelection,
  onNoStartReason,
  taskPunches,
}: RowHandlers & { task: TaskRow }) {
  const late = isVisuallyLate(t);
  const lateStartMinutes = startedLateMinutes(t);
  const operationalStatus = resolveOperationalStatus(t);
  const actions = availableActions(t, { userId, isManager });
  const archived = !!t.archived_at;
  const archivable = canArchive(t);
  const completionNote = completionNotes.get(t.id);
  const date = formatWallDate(t.scheduled_for ?? t.recurrence_date ?? t.due_at);
  const start = formatWallTime(t.scheduled_for);
  const end = formatWallTime(t.scheduled_end);
  const updated = formatLocalTime(t.updated_at);
  const refusalHistory = refusalsByTask.get(t.id) ?? [];
  const refusal = currentTaskRefusal(t, refusalHistory);
  const cancellation = currentTaskCancellation(t);
  const taskPunch = taskPunches.get(t.id);

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {isManager && onToggleTaskSelection && (
          <input
            type="checkbox"
            aria-label={`Selecionar tarefa ${t.title}`}
            checked={selectedTaskIds?.has(t.id) ?? false}
            onChange={() => onToggleTaskSelection(t.id)}
            className="mt-1 h-4 w-4 accent-primary"
          />
        )}
        <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t.title}</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${operationalStatus === "atrasada" ? "bg-destructive/15 text-destructive" : STATUS_TONE[operationalStatus]}`}>
            {operationalStatus === "atrasada" ? "Atrasada" : STATUS_LABELS[operationalStatus]}
          </span>
          {lateStartMinutes != null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
              <Clock className="h-3 w-3" /> Início com atraso · {formatStartedLateMinutes(lateStartMinutes)}
            </span>
          ) : late && operationalStatus !== "atrasada" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
              <Clock className="h-3 w-3" /> atrasado
            </span>
          ) : null}
        </div>
        {refusal && (
          <div className="mt-2 space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            <div className="font-semibold uppercase tracking-wide text-destructive">Recusada pelo funcionário</div>
            <div className="whitespace-pre-wrap break-words">
              Funcionário: {memberNames.get(refusal.employeeId) ?? "Funcionário"}
            </div>
            <div className="whitespace-pre-wrap break-words">Motivo: {refusal.reason ?? "Motivo não registrado"}</div>
            {refusal.refusedAt && (
              <div className="text-muted-foreground">Recusada em: {formatLocalTime(refusal.refusedAt)}</div>
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
        {cancellation && (
          <div className="mt-2 space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            <div className="font-semibold uppercase tracking-wide text-destructive">
              {cancellation.byEmployee ? "Cancelada pelo funcionário" : "Tarefa cancelada"}
            </div>
            <div className="whitespace-pre-wrap break-words">
              Motivo: {cancellation.reason ?? "Motivo não registrado"}
            </div>
            {cancellation.cancelledAt && (
              <div className="text-muted-foreground">Cancelada em: {formatLocalTime(cancellation.cancelledAt)}</div>
            )}
          </div>
        )}
        <TaskRefusalHistory records={refusalHistory} memberNames={memberNames} />
        {operationalStatus === "ausente" && (
          <div className="mt-2 space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            <div className="font-semibold uppercase tracking-wide text-destructive">
              {t.absence_source === "employee"
                ? "Falta registada pelo funcionário"
                : t.absence_source === "manual"
                  ? "Falta registada pelo gestor"
                  : "Ausência automática"}
            </div>
            {t.absence_reason ? (
              <div>
                Motivo: {t.absence_reason}
                {t.absence_justified != null && (t.absence_justified ? " · justificada" : " · injustificada")}
              </div>
            ) : (
              <div className="text-muted-foreground">Falta ainda sem motivo registado.</div>
            )}
            {t.marked_absent_at && (
              <div className="text-muted-foreground">Marcada em: {formatLocalTime(t.marked_absent_at)}</div>
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
          {taskPunch && <PauseSummary entry={taskPunch} />}
        </div>
        {t.description && <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.description}</div>}
        {completionNote && (
          <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <div className="font-semibold text-primary">Observação da conclusão</div>
            <div className="mt-0.5 whitespace-pre-wrap text-foreground">{completionNote.reason}</div>
            <div className="mt-1 text-muted-foreground">Registada em {formatLocalTime(completionNote.created_at)}</div>
          </div>
        )}
      </div>
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
        {/* ADR-044 — falta continua acessível em 'em andamento' e para completar o registo de ausências automáticas. */}
        {!actions.includes("marcar_ausente") && canMarkAbsent(t, { isManager, userId }) && (
          <Button
            size="sm"
            variant="ghost"
            title={t.status === "ausente" ? "Registar motivo da falta" : "Marcar falta"}
            onClick={() => onTransition(t, "marcar_ausente")}
          >
            <UserX className="h-3 w-3" />
            <span className="ml-1 hidden sm:inline">{t.status === "ausente" ? "Registar falta" : "Marcar falta"}</span>
          </Button>
        )}
        {onNoStartReason && (t.status === "pendente" || t.status === "autorizado") && late && (
          <Button size="sm" variant="ghost" title="Registar motivo de não ter iniciado" onClick={() => onNoStartReason(t)}>
            <FileText className="h-3 w-3" />
            <span className="ml-1 hidden sm:inline">Motivo</span>
          </Button>
        )}
        {actions.map((a) => (
          <ActionButton key={a} action={a} disabled={transitionPending} onClick={() => onTransition(t, a)} />
        ))}

      </div>
    </li>
  );
}

function PauseSummary({ entry }: { entry: TimeEntryRow }) {
  const minutes = pauseMinutesNow(entry);
  if (minutes == null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-foreground">
      <Clock className="h-3 w-3" />
      {!entry.resumed_at && !entry.ended_at ? "Em pausa" : `Pausa ${formatDuration(minutes)}`}
    </span>
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
  clients: {
    id: string;
    name: string;
    timing_mode?: "start_stop" | "manual" | null;
    contracted_minutes?: number | null;
  }[];
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
  const [scheduleConflicts, setScheduleConflicts] = useState<TaskScheduleConflict[]>([]);
  const [scheduleCheckError, setScheduleCheckError] = useState<string | null>(null);
  const confirmedConflictsRef = useRef(false);

  const handleRecurrenceChange = (next: RecurrenceFormValue) => {
    setRecurrence(next);
    if (next.enabled && next.frequency === "custom") {
      // The explicit date selection is also the task's visible date range.
      setTouchedDates(true);
      setStartDate(next.startDate);
      setEndDate(next.endDate);
    }
  };

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

  // ---------------------------------------------------------------
  // SUP-2026-000110 — programação habitual do cliente (sugestão).
  // Fonte de verdade reutilizada: séries ativas em `task_recurrences`.
  // Nunca sobrescreve horário já digitado pelo Gestor nem tarefas em edição.
  // ---------------------------------------------------------------
  const [clientSchedule, setClientSchedule] = useState<ClientScheduleSlot[]>([]);
  const [touchedTimes, setTouchedTimes] = useState(false);
  const [manualEndOverride, setManualEndOverride] = useState(Boolean(initial?.scheduled_end));
  const [touchedDates, setTouchedDates] = useState(false);
  const [schedulePrompt, setSchedulePrompt] = useState<ClientScheduleSlot[]>([]);
  const [scheduleHint, setScheduleHint] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  const selectedClient = clients.find((client) => client.id === clientId);
  const selectedSchedule = clientSchedule.find((schedule) => schedule.id === selectedScheduleId) ?? null;
  const contractedMinutes = selectedSchedule?.contractedMinutes ?? selectedClient?.contracted_minutes ?? null;
  const distributedMinutes = useMemo(
    () => distributeContractedMinutes(contractedMinutes, assignees.length),
    [contractedMinutes, assignees.length],
  );

  useEffect(() => {
    if (initial || manualEndOverride || contractedMinutes == null || !startDate || !startTime || assignees.length === 0) {
      return;
    }
    const [minutesForFirstEmployee] = distributedMinutes;
    if (minutesForFirstEmployee == null) return;
    const derivedEnd = addWallMinutes(startDate, startTime, minutesForFirstEmployee);
    if (!derivedEnd) return;
    setEndDate((current) => (current === derivedEnd.date ? current : derivedEnd.date));
    setEndTime((current) => (current === derivedEnd.time ? current : derivedEnd.time));
  }, [assignees.length, contractedMinutes, distributedMinutes, initial, manualEndOverride, startDate, startTime]);

  useEffect(() => {
    if (!startDate || !endDate || !isOvernightTimeRange(startTime, endTime) || endDate !== startDate) return;
    const nextDate = addWallMinutes(startDate, "00:00", 24 * 60)?.date;
    if (nextDate) setEndDate(nextDate);
  }, [endDate, endTime, startDate, startTime]);

  const applySlot = (slot: ClientScheduleSlot, silent = false) => {
    setSelectedScheduleId(slot.id);
    setManualEndOverride(false);
    if (slot.scheduleType === "fixed") {
      setStartTime(slot.startTime ?? "");
      setEndTime(slot.endTime ?? "");
    } else {
      setStartTime("");
      setEndTime("");
    }
    if (slot.punchMode) setPunchMode(slot.punchMode as PunchMode);
    setSchedulePrompt([]);
    if (!silent) setScheduleHint(`Horário sugerido pela programação do cliente: ${describeSlot(slot)}.`);
  };

  const suggestFromSchedule = (slots: ClientScheduleSlot[], dateKey: string) => {
    setSchedulePrompt([]);
    if (initial || touchedTimes || slots.length === 0) return;
    const effectiveDate = dateKey || (!touchedDates ? nextDateForSchedule(slots) : null);
    if (!effectiveDate) return;
    const matches = slotsForDate(slots, effectiveDate);
    const unique = matches.filter((s, i, arr) => arr.findIndex((o) => o.id === s.id) === i);
    if (unique.length === 1) {
      if (!dateKey && !startDate && !touchedDates) {
        setStartDate(effectiveDate);
        setEndDate(effectiveDate);
      }
      applySlot(unique[0]);
      return;
    }
    if (unique.length > 1) {
      setSchedulePrompt(unique);
      setScheduleHint(`Programação encontrada para ${effectiveDate}: escolha um dos horários abaixo.`);
    }
  };


  const fetchClientTeam = async (cid: string): Promise<string[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("client_default_assignees", { _client_id: cid });
    if (error) throw error;
    const rows = (data ?? []) as { user_id: string; is_active: boolean }[];
    // Só colaboradores ativos e que ainda pertencem à empresa (lista `members`).
    const memberIds = new Set(members.map((m) => m.id));
    return rows.filter((r) => r.is_active && memberIds.has(r.user_id)).map((r) => r.user_id);
  };

  const loadClientSchedule = async (cid: string) => {
    if (initial || !cid) {
      setClientSchedule([]);
      setSchedulePrompt([]);
      setScheduleHint(null);
      setSelectedScheduleId(null);
      return;
    }
    try {
      const slots = await fetchClientSchedule(cid);
      setClientSchedule(slots);
      setSelectedScheduleId(null);
      setScheduleHint(null);
      suggestFromSchedule(slots, startDate);
    } catch {
      // Cliente sem programação legível não pode bloquear a criação da tarefa.
      setClientSchedule([]);
      setSchedulePrompt([]);
    }
  };

  const applyClient = async (cid: string) => {
    setClientId(cid);
    setTeamPrompt(null);
    if (initial || !cid) return;
    void loadClientSchedule(cid);
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
        if (!initial && recurrence.enabled && recurrence.frequency === "custom") {
          const selectedDates = normalizeCustomRecurrenceDates(recurrence.selectedDates);
          if (selectedDates.length === 0) {
            toast.error("Selecione pelo menos uma data no calendário da recorrência.");
            return;
          }
        }
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
        const resolvedEndDate =
          startDate && endDate === startDate && isOvernightTimeRange(startTime, endTime)
            ? addWallMinutes(startDate, "00:00", 24 * 60)?.date ?? endDate
            : endDate;
        const endISO = endTime ? wallDateTimeToISO(resolvedEndDate, endTime) : null;
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
        const useContractedSchedule =
          contractedMinutes != null && !manualEndOverride && startDate !== "" && startTime !== "";
        const scheduleRulesByEmployee = selectedSchedule?.cycleLengthWeeks && selectedSchedule.cycleLengthWeeks > 1
          ? assignees.map((_, employeeIndex) => clientSchedule
              .filter((slot) =>
                slot.id.startsWith(`client-habitual:${clientId}:`) &&
                slot.cycleLengthWeeks === selectedSchedule.cycleLengthWeeks &&
                slot.cycleAnchorDate === selectedSchedule.cycleAnchorDate,
              )
              .map((slot) => ({
                weekdays: slot.weekdays,
                start_time: slot.startTime,
                duration_minutes: distributeContractedMinutes(
                  slot.contractedMinutes ?? slot.durationMinutes,
                  assignees.length,
                )[employeeIndex] ?? slot.contractedMinutes ?? slot.durationMinutes,
                cycle_length_weeks: slot.cycleLengthWeeks,
                cycle_position: slot.cyclePosition,
                cycle_anchor_date: slot.cycleAnchorDate,
              })))
          : [];
        const manualDurationMinutes =
          startISO && endISO ? Math.max(0, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000)) : 0;
        const taskTimesFor = (index: number) => {
          if (!useContractedSchedule) {
            return { scheduled_for: startISO, scheduled_end: endISO, due_at: dueISO };
          }
          const minutes = distributedMinutes[index] ?? distributedMinutes[0] ?? 0;
          const end = addWallMinutes(startDate, startTime, minutes);
          if (!end) return { scheduled_for: startISO, scheduled_end: endISO, due_at: dueISO };
          const scheduledEnd = wallDateTimeToISO(end.date, end.time);
          return { scheduled_for: startISO, scheduled_end: scheduledEnd, due_at: scheduledEnd ?? dueISO };
        };

        // SUP-2026-000140 — consulta definitiva imediatamente antes da gravação.
        // Para recorrências, cada data é enviada como uma proposta separada;
        // assim overnight e conflitos pontuais não viram um bloqueio da série.
        if (!confirmedConflictsRef.current) {
          const recurrenceDates = recurrence.enabled
            ? recurrence.frequency === "custom"
              ? normalizeCustomRecurrenceDates(recurrence.selectedDates)
              : previewRecurrenceDates(
                  {
                    frequency: recurrence.frequency,
                    intervalWeeks: recurrence.intervalWeeks,
                    weekdays: recurrence.weekdays,
                    monthlyRule:
                      recurrence.monthPosition != null
                        ? { position: recurrence.monthPosition, weekday: recurrence.monthWeekday }
                        : { day_of_month: recurrence.dayOfMonth },
                    startDate: recurrence.startDate,
                    endDate: recurrence.endDate || null,
                  },
                  400,
                ).map(localDateToDateKey)
            : [startDate];
          const proposals = recurrence.enabled
            ? recurrenceDates.flatMap((dateKey) =>
                assignees.flatMap((memberId, index) => {
                  if (!startTime) return [];
                  const minutes = useContractedSchedule
                    ? distributedMinutes[index] ?? distributedMinutes[0] ?? 0
                    : manualDurationMinutes;
                  const end = addWallMinutes(dateKey, startTime, minutes);
                  if (!end) return [];
                  const proposedStart = wallDateTimeToISO(dateKey, startTime);
                  const proposedEnd = wallDateTimeToISO(end.date, end.time);
                  return proposedStart && proposedEnd
                    ? [{ assignee_id: memberId, start_at: proposedStart, end_at: proposedEnd }]
                    : [];
                }),
              )
            : assignees.flatMap((memberId, index) => {
                const times = taskTimesFor(index);
                return times.scheduled_for && times.scheduled_end
                  ? [{ assignee_id: memberId, start_at: times.scheduled_for, end_at: times.scheduled_end }]
                  : [];
              });
          try {
            const conflicts = await checkTaskScheduleConflicts(companyId, proposals, initial?.id);
            if (conflicts.length > 0) {
              setScheduleConflicts(conflicts);
              submittingRef.current = false;
              setLoading(false);
              return;
            }
          } catch (conflictError) {
            const technicalError = conflictError as {
              code?: string;
              message?: string;
              details?: string;
              hint?: string;
            };
            const diagnostic = [
              technicalError.code ? `Código: ${technicalError.code}` : null,
              technicalError.message ?? "Falha desconhecida na consulta de sobreposição.",
              technicalError.details ? `Detalhes: ${technicalError.details}` : null,
              technicalError.hint ? `Orientação: ${technicalError.hint}` : null,
            ]
              .filter(Boolean)
              .join("\n");
            console.error("[task-schedule-conflicts] failed", {
              code: technicalError.code,
              message: technicalError.message,
              details: technicalError.details,
              hint: technicalError.hint,
              error: conflictError,
            });
            submittingRef.current = false;
            setLoading(false);
            setScheduleCheckError(diagnostic);
            return;
          }
        }
        confirmedConflictsRef.current = false;
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
          const derivedDuration = manualDurationMinutes;
          // Uma série (task_recurrence) por funcionário selecionado.
          // ADR-041: inserção individual + idempotência. Se o banco recusar por
          // série ativa equivalente (RECURRENCE_DUPLICATE_ACTIVE), tratamos como
          // "já existe" — nunca criamos um clone e nunca abortamos os restantes.
          let duplicates = 0;
          let created = 0;
          for (const [index, memberId] of assignees.entries()) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ins = await (supabase.from("task_recurrences" as any) as any).insert({
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
              // Mensal: dia fixo do mês (legado) OU posição no mês (BYSETPOS/BYDAY).
              monthly_rule:
                recurrence.frequency === "monthly"
                  ? recurrence.monthPosition != null
                    ? { position: recurrence.monthPosition, weekday: recurrence.monthWeekday }
                    : { day_of_month: recurrence.dayOfMonth }
                  : {},
              start_date: recurrence.startDate,
              end_date: recurrence.endDate || null,
              selected_dates:
                recurrence.frequency === "custom"
                  ? normalizeCustomRecurrenceDates(recurrence.selectedDates)
                  : [],
              scheduled_time: derivedTime,
              duration_minutes: useContractedSchedule
                ? distributedMinutes[index] ?? distributedMinutes[0] ?? derivedDuration
                : derivedDuration,
              schedule_rules: scheduleRulesByEmployee[index] ?? [],
              task_group_id: groupId,
            });
            if (ins.error) {
              if (String(ins.error.message ?? "").includes("RECURRENCE_DUPLICATE_ACTIVE")) {
                duplicates += 1;
                continue;
              }
              error = ins.error;
              break;
            }
            created += 1;
          }
          if (!error) {
            if (created > 0) {
              // Horizonte cobre a série até a data final (cap 400d); sem data final, 60d.
              const horizon = recurrence.endDate
                ? Math.min(
                    400,
                    Math.max(
                      1,
                      Math.ceil(
                        (new Date(`${recurrence.endDate}T12:00:00`).getTime() - Date.now()) / 86_400_000,
                      ) + 1,
                    ),
                  )
                : 60;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase.rpc as any)("recurrence_materialize", {
                _days_ahead: horizon,
                _company_id: companyId,
              });
            }
            if (duplicates > 0) {
              toast.info(
                created > 0
                  ? `${duplicates} recorrência(s) já existiam e não foram duplicadas.`
                  : "Esta recorrência já existe e não foi duplicada.",
              );
            }
          }
        } else {
          // Uma tarefa por funcionário selecionado (tasks.assigned_to segue único).
          const inserted = await supabase
            .from("tasks")
            .insert(
              assignees.map((memberId, index) => ({
                ...payload,
                assigned_to: memberId,
                company_id: companyId,
                created_by: userId,
                task_group_id: groupId,
                ...taskTimesFor(index),
              })),
            )
            .select("id")
          ;
          error = inserted.error;
          for (const row of inserted.data ?? []) createdTaskIds.push(row.id);
        }

        if (error) {
          submittingRef.current = false;
          setLoading(false);
          toast.error(error.message);
          return;
        }
        if (!initial && createdTaskIds.length > 0 && pendingDocs.length > 0) {
          try {
            for (const taskId of createdTaskIds) await uploadCreationDocs(taskId);
          } catch (e) {
            submittingRef.current = false;
            setLoading(false);
            toast.error((e as Error).message);
            return;
          }
        }
        submittingRef.current = false;
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
        {!initial && (clientSchedule.length > 0 || contractedMinutes != null) && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <p className="font-medium text-foreground">Configuração do cliente</p>
            {clientSchedule.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {clientSchedule.map((s) => (
                  <li key={s.id}>{describeSlot(s)}</li>
                ))}
              </ul>
            )}
            {contractedMinutes != null && (
              <p className="mt-1 text-muted-foreground">
                Carga total contratada: <span className="font-medium text-foreground">{formatContractedMinutes(contractedMinutes)}</span>
              </p>
            )}
            {distributedMinutes.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                {assignees.length} {assignees.length === 1 ? "funcionário" : "funcionários"} selecionado(s)
                {" → "}
                <span className="font-medium text-foreground">{formatContractedMinutes(distributedMinutes[0])} por funcionário</span>
              </p>
            )}
            {contractedMinutes != null && assignees.length === 0 && (
              <p className="mt-1 text-muted-foreground">Selecione pelo menos um funcionário para calcular a duração individual.</p>
            )}
            {schedulePrompt.length > 1 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-foreground">Este cliente possui mais de uma programação para este dia.</p>
                <div className="flex flex-wrap gap-1.5">
                  {schedulePrompt.map((s) => (
                    <Button key={s.id} type="button" size="sm" variant="outline" onClick={() => applySlot(s)}>
                      {s.title}: {s.startTime ?? "flexível"}
                      {s.endTime ? `–${s.endTime}` : ""}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {scheduleHint && <p className="mt-1 text-muted-foreground">{scheduleHint}</p>}
          </div>
        )}
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
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              const next = e.target.value;
              setTouchedDates(true);
              setStartDate(next);
              suggestFromSchedule(clientSchedule, next);
            }}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Hora início <span className="text-xs text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => {
              setTouchedTimes(true);
              setSchedulePrompt([]);
              setStartTime(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Data fim</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setTouchedDates(true);
              setEndDate(e.target.value);
            }}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Hora fim <span className="text-xs text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => {
              setManualEndOverride(true);
              setTouchedTimes(true);
              setSchedulePrompt([]);
              setEndTime(e.target.value);
            }}
          />
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
      {!initial && <RecurrenceForm value={recurrence} onChange={handleRecurrenceChange} timingMode={timingMode} />}
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
    <AlertDialog
      open={scheduleConflicts.length > 0}
      onOpenChange={(open) => {
        if (!open) {
          setScheduleConflicts([]);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-warning-foreground">
            <AlertTriangle className="h-5 w-5" /> Atenção: sobreposição de tarefas
          </AlertDialogTitle>
          <AlertDialogDescription>
            Uma ou mais pessoas selecionadas já possuem tarefas neste período. A criação continua disponível.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          {assignees.map((assigneeId) => {
            const employeeConflicts = scheduleConflicts.filter((conflict) => conflict.assignee_id === assigneeId);
            const member = members.find((m) => m.id === assigneeId);
            const employee = member?.full_name?.trim() || member?.email?.trim() || "Funcionário";
            return (
              <div key={assigneeId} className="space-y-2 rounded-md border border-border/70 bg-background/70 p-3">
                <p className="font-semibold text-foreground">
                  {employeeConflicts.length > 0 ? "⚠" : "✓"} {employee}
                </p>
                {employeeConflicts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Disponível neste horário</p>
                ) : (
                  employeeConflicts.map((conflict, index) => (
                    <div key={`${conflict.conflicting_task_id}-${conflict.proposed_start}-${index}`} className="space-y-1">
                      <p className="text-muted-foreground">
                        Tarefa existente: <span className="font-medium text-foreground">{conflict.conflicting_client_name || conflict.conflicting_title}</span>
                      </p>
                      <p className="text-muted-foreground">
                        {formatWallDate(conflict.conflicting_start)} · {formatWallTime(conflict.conflicting_start)} → {formatWallTime(conflict.conflicting_end)}
                      </p>
                      <p className="text-muted-foreground">
                        Nova tarefa: {formatWallDate(conflict.proposed_start)} · {formatWallTime(conflict.proposed_start)} → {formatWallTime(conflict.proposed_end)}
                      </p>
                      <p className="font-medium text-warning-foreground">
                        Conflito: {formatWallTime(conflict.overlap_start)} → {formatWallTime(conflict.overlap_end)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setScheduleConflicts([])}>Voltar e ajustar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              confirmedConflictsRef.current = true;
              setScheduleConflicts([]);
              (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
            }}
          >
            Criar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog
      open={scheduleCheckError !== null}
      onOpenChange={(open) => {
        if (!open) setScheduleCheckError(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Falha técnica na verificação</AlertDialogTitle>
          <AlertDialogDescription>
            A tarefa não foi criada. Corrija a configuração do banco e tente novamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {scheduleCheckError}
        </pre>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setScheduleCheckError(null)}>Voltar ao formulário</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
