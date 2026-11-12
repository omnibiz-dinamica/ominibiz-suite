import { firstNameOf } from "@/lib/person-name";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { addWallMinutes, isOvernightTimeRange, formatContractedMinutes } from "@/lib/tasks/contracted-hours";
import { Plus, Check, Repeat, Trash2, Archive, FileText, ListTodo } from "lucide-react";
import { type TaskAction, type TaskRow, sweepAbsent, transitionTask, transitionTaskWithScheduleRequest, archiveTask, addTaskCompletionNote, isBulkArchiveEligible, isBulkDeleteEligible, type TimeEntryRow, recordNoStartReason } from "@/lib/tasks";

import { TaskDocuments } from "@/components/tasks/TaskDocuments";
import { ReassignDialog } from "@/components/tasks/ReassignDialog";
import { useFormDraft } from "@/lib/form-draft";
import { EditRecurrenceDialog } from "@/components/tasks/EditRecurrenceDialog";
import type { RecurrenceRow } from "@/lib/tasks";
import { isRefused } from "@/lib/tasks";
import { CancelTaskDialog } from "@/components/tasks/CancelTaskDialog";
import { DeleteRecurrenceDialog, GroupMatesPicker, type GroupMate } from "@/components/tasks/DeleteRecurrenceDialog";
import { MarkAbsentDialog } from "@/components/tasks/MarkAbsentDialog";
import { OpenPunchRecoveryDialog, type RecoveryEntry } from "@/components/ponto/OpenPunchRecoveryDialog";
import { fetchOpenEntries, fetchOpenEntrySelf } from "@/lib/punch/recovery";
import { groupTaskRefusals, type TaskRefusalRecord } from "@/lib/task-refusal-view";
import { RefuseTaskDialog, type RefusalSubmitPayload } from "@/components/tasks/RefuseTaskDialog";

import { EmployeeMultiPicker } from "@/components/common/EmployeePicker";
import { MultiClientSelect } from "@/components/common/MultiClientSelect";
import { filterCalendarData } from "@/lib/tasks/calendar-filter";
import { sortTasksForList } from "@/lib/tasks/list-order";
import { matchesDashboardBucket, taskOperationalDay } from "@/lib/tasks/dashboard-counters";
import { wallDateToEndOfDayISO, wallDateTimeToISO, formatWallDate, formatWallTime } from "@/lib/wall-clock";
import { STATUS_FILTERS, StatusFilter, TasksSearch, ClientOption, clientNameCache, clientInstructionsCache, TaskClientAddressInfo, clientAddressCache, CompletionNote, ApprovedVacation, TaskMember, taskMemberName, taskMemberFirstName } from "../components/tasks/page/shared";
import { snapshotGroupForRebalance, applyGroupRebalance } from "../components/tasks/page/rebalance";
import { TaskPlanningCalendar } from "../components/tasks/page/calendar";
import { FilterChip, TaskListSections, ClientFilterEmptyState } from "../components/tasks/page/list";
import { TaskFormDraft, TaskForm } from "../components/tasks/page/task-form";


export const Route = createFileRoute("/app/tarefas")({
  head: () => ({ meta: [
    { title: "Tarefas | OmniBiz Suite" },
    { name: "description", content: "Gestão de tarefas, horários e equipas no OmniBiz Suite." },
    { property: "og:title", content: "Tarefas | OmniBiz Suite" },
    { property: "og:description", content: "Gestão de tarefas, horários e equipas no OmniBiz Suite." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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
    // Filtro de dia operacional (vindo do Dashboard). O histórico continua
    // acessível: basta limpar o filtro de data.
    const date = typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : undefined;
    return { status, employee, client, task, date };
  },
});

function TasksPage() {
  const { user, profile, isManager, isSuperAdmin, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);

  // ----- Rascunho automático do formulário de tarefa (criar/editar) -----
  // O diálogo desmonta o TaskForm, por isso o rascunho vive aqui: o
  // formulário reporta os valores e recebe o rascunho para restaurar.
  const [taskDraftValues, setTaskDraftValues] = useState<TaskFormDraft | null>(null);
  const taskBaselineRef = useRef("");
  const taskReopenedRef = useRef(false);
  const taskDialogOpen = open || !!editing;
  const taskDraftDirty =
    taskDialogOpen && taskDraftValues !== null && JSON.stringify(taskDraftValues) !== taskBaselineRef.current;
  const taskDraft = useFormDraft<TaskFormDraft>({
    formId: "task-form",
    recordId: editing?.id ?? null,
    companyId: currentCompanyId,
    userId: user?.id,
    enabled: isManager && !!user && !!currentCompanyId,
    baseUpdatedAt: (editing as { updated_at?: string | null } | null)?.updated_at ?? null,
    dirty: taskDraftDirty,
  });
  // Nova sessão de diálogo: zera a linha de base do rascunho.
  useEffect(() => {
    taskBaselineRef.current = "";
    setTaskDraftValues(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);
  // Reabre o diálogo de criação se havia rascunho com o formulário aberto.
  useEffect(() => {
    if (!taskDraft.restored || !taskDraft.restoredOpen) return;
    if (taskDialogOpen || taskReopenedRef.current) return;
    taskReopenedRef.current = true;
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDraft.restored, taskDraft.restoredOpen, taskDialogOpen]);
  const handleTaskDraftValues = (values: TaskFormDraft) => {
    const json = JSON.stringify(values);
    if (taskBaselineRef.current === "") taskBaselineRef.current = json;
    setTaskDraftValues(values);
    // Formulário ainda sem alterações: não cria rascunho (evita "Rascunho recuperado" vazio).
    if (json === taskBaselineRef.current) return;
    taskDraft.save(values, { open: true });
  };
  const clearTaskDraft = () => {
    taskBaselineRef.current = "";
    setTaskDraftValues(null);
    taskDraft.clear();
  };
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
  // ADR-062 — o estado do formulário de recusa vive no diálogo canónico.
  const [view, setView] = useState<"active" | "archived">("active");
  const [taskView, setTaskView] = useState<"list" | "calendar">("calendar");
  const [calendarGroup, setCalendarGroup] = useState<"assignee" | "client">("assignee");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"archive" | "delete" | null>(null);
  const [noStartTarget, setNoStartTarget] = useState<TaskRow | null>(null);
  const [noStartReason, setNoStartReason] = useState("");

  const selectedEmployeeIds = useMemo(
    () => (search.employee ? search.employee.split(",").filter(Boolean) : []),
    [search.employee],
  );
  // Filtro de vários clientes: IDs separados por vírgula na URL (?client=a,b).
  const selectedClientIds = useMemo(
    () => (search.client ? search.client.split(",").filter(Boolean) : []),
    [search.client],
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
    queryKey: ["tasks", currentCompanyId, user?.id, isManager, view],
    queryFn: async () => {
      const buildQuery = () => {
        let q = supabase
          .from("tasks")
          .select("*")
          .order("scheduled_for", { ascending: true, nullsFirst: false })
          .order("recurrence_date", { ascending: true, nullsFirst: false })
          .order("due_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true, nullsFirst: false });
        // O contexto da empresa faz parte da identidade da consulta. Sem este
        // filtro, uma sessão com mais de uma empresa podia carregar tarefas de
        // outro contexto enquanto o AuthContext ainda era inicializado.
        if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
        if (!isManager) q = q.eq("assigned_to", user!.id);
        // Tarefas removidas (soft delete) nunca são fonte de verdade operacional:
        // sem este filtro a mesma ocorrência aparecia repetida para o gestor.
        q = q.is("deleted_at", null);
        // Notificação (?task=ID) não filtra mais a consulta: a tela fica normal e a tarefa é destacada.
        if (view === "archived") q = q.not("archived_at", "is", null);
        else q = q.is("archived_at", null);
        return q;
      };
      // A API corta a resposta em 1000 linhas: sem paginação, empresas com
      // muitas ocorrências perdiam tarefas (e colaboradores) na listagem.
      const pageSize = 1000;
      const rows: TaskRow[] = [];
      for (let page = 0; page < 50; page += 1) {
        const { data, error } = await buildQuery().range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as TaskRow[];
        rows.push(...batch);
        if (batch.length < pageSize) break;
      }
      return rows;
    },

    enabled: !!user && !!currentCompanyId,
    // 11092026-002c — voltar à aba/janela nunca atualiza a lista. O estado
    // atual (filtros, seleção, modal, formulário) é a fonte de verdade; a
    // atualização acontece só por ação explícita do utilizador.
    refetchOnWindowFocus: false,
  });

  // Tarefa aberta pela notificação que não está na vista atual (ex.: arquivada):
  // carregada à parte só para continuar visível e destacada.
  const focusTaskInList = !!search.task && (tasks ?? []).some((t) => t.id === search.task);
  const { data: focusTaskExtra } = useQuery({
    queryKey: ["task-focus", currentCompanyId, search.task, isManager, user?.id],
    enabled: !!search.task && !!currentCompanyId && !!user && !isLoading && !focusTaskInList,
    queryFn: async () => {
      let q = supabase.from("tasks").select("*").eq("id", search.task!).is("deleted_at", null);
      if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      if (!isManager) q = q.eq("assigned_to", user!.id);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as TaskRow | null;
    },
    refetchOnWindowFocus: false,
  });

  // Uma consulta única vincula o ponto mais recente a cada tarefa exibida.
  // A pausa continua sendo lida de time_entries, sem duplicar dados em tasks.
  const taskIds = useMemo(() => (tasks ?? []).map((task) => task.id), [tasks]);
  const { data: taskPunches } = useQuery({
    queryKey: ["task-punches", currentCompanyId, taskIds],
    queryFn: async (): Promise<TimeEntryRow[]> => {
      if (!currentCompanyId || taskIds.length === 0) return [];
      // Não enviar milhares de ids num .in(): com ~5.000 tarefas o endereço do pedido passava de
      // 190 KB e a ligação era cortada (Failed to fetch). Lê os pontos da empresa em páginas
      // e filtra no navegador pelas tarefas carregadas, mantendo a ordem por started_at desc.
      const taskIdSet = new Set(taskIds);
      const rows: TimeEntryRow[] = [];
      const pageSize = 1000;
      for (let page = 0; page < 50; page++) {
        const { data, error } = await supabase
          .from("time_entries")
          .select(
            "id,company_id,task_id,user_id,started_at,paused_at,resumed_at,ended_at,effective_minutes,notes,created_at,updated_at,prior_pause_seconds",
          )
          .eq("company_id", currentCompanyId)
          .not("task_id", "is", null)
          .order("started_at", { ascending: false })
          .order("id", { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as TimeEntryRow[];
        for (const row of batch) {
          if (row.task_id && taskIdSet.has(row.task_id)) rows.push(row);
        }
        if (batch.length < pageSize) break;
      }
      return rows;
    },
    enabled: !!user && !!currentCompanyId && tasks !== undefined,
  });

  const { data: members } = useQuery({
    queryKey: ["members", currentCompanyId],
    queryFn: async (): Promise<TaskMember[]> => {
      if (!currentCompanyId) return [];
      if (!isManager) {
        // ADR-062 — funcionários não leem user_roles/profiles de terceiros por RLS;
        // a RPC company_member_options devolve apenas (id, nome) dos colegas da empresa.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)("company_member_options");
        if (error) throw error;
        return ((data ?? []) as { id: string; full_name: string | null; company_id: string }[])
          .filter((m) => m.company_id === currentCompanyId)
          .map(({ id, full_name }) => ({ id, full_name }));
      }
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", currentCompanyId);
      if (rolesError) throw rolesError;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      // Keep this projection aligned with the canonical team screen. The
      // profile name is the display source; email is resolved separately.
      const { data: profs, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, job_title")
        .in("id", ids);
      if (profilesError) throw profilesError;
      return profs ?? [];
    },
    enabled: !!currentCompanyId,
  });

  /**
   * SUP-2026-000305 — setor do cadastro do funcionário (ex.: Coifas, Tobaco) para
   * pesquisar e mostrar nas listas de funcionários. Consulta separada e tolerante:
   * se falhar, as pesquisas ficam exatamente como antes (só nome/cargo).
   */
  const memberIdsKey = (members ?? []).map((m) => m.id).sort().join(",");
  // Ticket 172: também o número da equipa (team_number).
  const { data: memberTeams } = useQuery({
    queryKey: ["members-team-numbers", currentCompanyId, memberIdsKey],
    queryFn: async (): Promise<Record<string, number>> => {
      const map: Record<string, number> = {};
      const ids = (members ?? []).map((m) => m.id);
      if (ids.length === 0) return map;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("profiles" as never) as any).select("id, team_number").in("id", ids);
        if (error) return map;
        for (const row of (data ?? []) as { id: string; team_number: number | null }[]) {
          if (row.team_number != null) map[row.id] = Number(row.team_number);
        }
      } catch {
        // sem número de equipa: pesquisa como antes
      }
      return map;
    },
    enabled: !!currentCompanyId && isManager && (members ?? []).length > 0,
    staleTime: 60 * 1000,
    retry: false,
  });
  const { data: memberSectors } = useQuery({
    queryKey: ["members-sectors", currentCompanyId, memberIdsKey],
    queryFn: async (): Promise<Record<string, string>> => {
      const map: Record<string, string> = {};
      const ids = (members ?? []).map((m) => m.id);
      if (ids.length === 0) return map;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("profiles" as never) as any).select("id, sector").in("id", ids);
        if (error) return map;
        for (const row of (data ?? []) as { id: string; sector: string | null }[]) {
          const sector = row.sector?.trim();
          if (sector) map[row.id] = sector;
        }
      } catch {
        // sem setor: pesquisa só por nome/cargo
      }
      return map;
    },
    enabled: !!currentCompanyId && isManager && (members ?? []).length > 0,
    staleTime: 60 * 1000,
    retry: false,
  });
  /** Junta cargo e setor (quando conhecidos) a uma lista de funcionários. */
  const withMemberDetails = (list: TaskMember[]): TaskMember[] =>
    list.map((m) => ({
      ...m,
      job_title: m.job_title ?? (members ?? []).find((x) => x.id === m.id)?.job_title ?? null,
      sector: m.sector ?? memberSectors?.[m.id] ?? null,
      team_number: m.team_number ?? memberTeams?.[m.id] ?? null,
    }));

  // Tipo A — telas de NOVA atribuição: só funcionários ATIVOS, filtrados no servidor.
  const { data: activeMembers } = useQuery({
    queryKey: ["members-active", currentCompanyId],
    queryFn: async (): Promise<TaskMember[]> => {
      if (!currentCompanyId) return [];
      // A situação ativa/inativa pertence ao perfil global, não à empresa.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("company_active_member_options");
      if (error) throw error;
      return ((data ?? []) as { id: string; full_name: string | null; company_id: string }[])
        .filter((m) => m.company_id === currentCompanyId)
        .map(({ id, full_name }) => ({ id, full_name }));
    },
    enabled: !!currentCompanyId,
  });

  const {
    data: clientsList,
    isLoading: clientsLoading,
    isError: clientsError,
    refetch: refetchClients,
  } = useQuery({
    queryKey: ["clients-min", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [] as ClientOption[];
      const { data, error } = await (supabase.from("clients" as never) as any)
        .select("id,name,timing_mode,contracted_minutes")
        .eq("company_id", currentCompanyId)
        .eq("status", "ativo")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ClientOption[];
    },
    enabled: !!currentCompanyId,
  });
  for (const c of clientsList ?? []) clientNameCache.set(c.id, c.name);

  // Instruções adicionais dos clientes (só para exibir no calendário). Consulta separada e
  // tolerante a falhas: se der erro, o calendário fica exatamente como antes.
  const { data: clientInstructionsMap } = useQuery({
    queryKey: ["tasks-client-instructions", currentCompanyId],
    queryFn: async () => {
      const map: Record<string, string> = {};
      if (!currentCompanyId) return map;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("clients" as never) as any)
          .select("id,instructions")
          .eq("company_id", currentCompanyId)
          .not("instructions", "is", null);
        if (error) return map;
        for (const r of (data ?? []) as { id: string; instructions: string | null }[]) {
          const text = (r.instructions ?? "").trim();
          if (text) map[r.id] = text;
        }
      } catch {
        // sem instruções: o calendário segue igual
      }
      return map;
    },
    enabled: !!currentCompanyId,
    staleTime: 60 * 1000,
    retry: false,
  });
  clientInstructionsCache.clear();
  for (const [id, text] of Object.entries(clientInstructionsMap ?? {})) clientInstructionsCache.set(id, text);

  // Endereço dos clientes para a lista e o calendário (mesma origem da Folha de Ponto).
  // Consulta separada e tolerante a falhas: se der erro, a tela fica exatamente como antes.
  const { data: clientAddressMap } = useQuery({
    queryKey: ["tasks-client-addresses", currentCompanyId],
    queryFn: async () => {
      const map: Record<string, TaskClientAddressInfo> = {};
      if (!currentCompanyId) return map;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("clients" as never) as any)
          .select("id,address,geo_address,geo_lat,geo_lng")
          .eq("company_id", currentCompanyId);
        if (error) return map;
        for (const r of (data ?? []) as {
          id: string;
          address: string | null;
          geo_address: string | null;
          geo_lat: number | null;
          geo_lng: number | null;
        }[]) {
          const address = (r.address ?? "").trim() || (r.geo_address ?? "").trim() || null;
          const lat = typeof r.geo_lat === "number" ? r.geo_lat : null;
          const lng = typeof r.geo_lng === "number" ? r.geo_lng : null;
          if (address || (lat !== null && lng !== null)) map[r.id] = { address, lat, lng };
        }
      } catch {
        // sem endereço: a tela segue igual
      }
      return map;
    },
    enabled: !!currentCompanyId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  clientAddressCache.clear();
  for (const [id, info] of Object.entries(clientAddressMap ?? {})) clientAddressCache.set(id, info);

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
        .select(
          "id,company_id,task_id,employee_id,actor_id,reason,previous_status,new_status,created_at,schedule_change_requested_date,schedule_change_requested_time,schedule_change_needs_reassignment,schedule_change_suggested_employee_id",
        )
        .eq("company_id", currentCompanyId)
        .order("created_at", { ascending: false });
      if (!isManager) q = q.eq("employee_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaskRefusalRecord[];
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
   * Tarefas criadas em equipe: o selo mostra os primeiros nomes de todos os
   * responsáveis do grupo, em vez de apenas "em equipe". Este é o único lugar
   * que continua abreviado, por ser um selo compacto dentro do cartão.
   */
  // Funcionário só lê a própria linha da tarefa (RLS). Os colegas do mesmo grupo vêm de uma
  // RPC somente leitura que confirma que o usuário pertence ao grupo e à mesma empresa.
  const myTaskGroupIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks ?? []) {
      const gid = (t as { task_group_id?: string | null }).task_group_id;
      if (gid) set.add(gid);
    }
    return Array.from(set).sort();
  }, [tasks]);
  const { data: groupColleagues } = useQuery({
    queryKey: ["my-task-group-colleagues", user?.id, currentCompanyId, myTaskGroupIds.join(",")],
    enabled: !!user && !isManager && myTaskGroupIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("my_task_group_colleagues", {
        _group_ids: myTaskGroupIds,
      });
      if (error) {
        // Sem a RPC (ou em erro) o selo mantém o comportamento anterior.
        console.warn("[my-task-group-colleagues] indisponível:", error.message);
        return [];
      }
      return (data ?? []) as { task_group_id: string; user_id: string; full_name: string | null }[];
    },
  });

  const groupMemberNames = useMemo(() => {
    const byGroup = new Map<string, string[]>();
    for (const task of tasks ?? []) {
      const groupId = (task as { task_group_id?: string | null }).task_group_id;
      if (!groupId || !task.assigned_to) continue;
      const name = taskMemberFirstName(members ?? [], task.assigned_to);
      const list = byGroup.get(groupId) ?? [];
      if (!list.includes(name)) list.push(name);
      byGroup.set(groupId, list);
    }
    // Funcionário: soma os colegas da mesma tarefa em equipe (RPC só devolve grupos em que
    // ele próprio está), para o selo mostrar todos os responsáveis, tal como o gestor vê.
    if (!isManager && groupColleagues?.length) {
      for (const row of groupColleagues) {
        if (!row.task_group_id || !row.user_id) continue;
        const name = firstNameOf(row.full_name) || taskMemberFirstName(members ?? [], row.user_id);
        const list = byGroup.get(row.task_group_id) ?? [];
        if (!list.includes(name)) list.push(name);
        byGroup.set(row.task_group_id, list);
      }
    }
    const labels = new Map<string, string>();
    for (const [groupId, names] of byGroup) {
      labels.set(groupId, names.sort((a, b) => a.localeCompare(b, "pt-BR")).join(", "));
    }
    return labels as ReadonlyMap<string, string>;
  }, [tasks, members, isManager, groupColleagues, user?.id]);

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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_audit_events" }, () =>
        qc.invalidateQueries({ queryKey: ["task-completion-notes"] }),
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
    mutationFn: ({
      id,
      action,
      reason,
      requestedDate,
      requestedTime,
      needsReassignment,
      suggestedEmployeeName,
    }: {
      id: string;
      action: TaskAction;
      reason?: string;
      requestedDate?: string;
      requestedTime?: string | null;
      needsReassignment?: boolean;
      suggestedEmployeeName?: string | null;
    }) =>
      requestedDate && needsReassignment !== undefined
        ? transitionTaskWithScheduleRequest(id, action, reason ?? "", {
            requestedDate,
            requestedTime,
            needsReassignment,
            suggestedEmployeeName,
          })
        : transitionTask(id, action, reason),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks-open-punches"] });
      qc.invalidateQueries({ queryKey: ["task-refusals"] });
      toast.success("Tarefa atualizada");
      setRefusing(null);
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
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (noteSaved) toast.success("Tarefa concluída");
      else toast.warning("Tarefa concluída, mas a observação não foi salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    // Recebe a tarefa clicada e, opcionalmente, as dos colegas marcados no modal.
    mutationFn: async (ids: string[]) => {
      // Divisão de horas: guarda o grupo do dia ANTES de excluir, para recalcular quem fica.
      const rebalanceSnapshot = await snapshotGroupForRebalance(ids, (clientId) =>
        clientId ? (clientsList?.find((c) => c.id === clientId)?.contracted_minutes ?? null) : null,
      );
      const failed: string[] = [];
      const deletedIds = new Set<string>();
      for (const [index, id] of ids.entries()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.rpc as any)("task_soft_delete", { _task_id: id });
        if (error) {
          if (index === 0) throw new Error(error.message);
          failed.push(error.message);
        } else {
          deletedIds.add(id);
        }
      }
      const rebalance = rebalanceSnapshot ? await applyGroupRebalance(rebalanceSnapshot, deletedIds) : null;
      return { total: ids.length, failed, rebalance };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (res.failed.length > 0) {
        toast.warning(
          `${res.total - res.failed.length} de ${res.total} tarefas excluídas. Não foi possível excluir: ${res.failed[0]}`,
        );
      } else {
        toast.success(res.total > 1 ? `${res.total} tarefas excluídas` : "Tarefa excluída");
      }
      if (res.rebalance?.kind === "updated") {
        toast.success(
          `Horas recalculadas para ${res.rebalance.count === 1 ? "o funcionário que ficou" : `os ${res.rebalance.count} funcionários que ficaram`}: ${formatContractedMinutes(res.rebalance.minutes[0] ?? 0)}${res.rebalance.count > 1 ? " cada" : ""}${res.rebalance.startTime ? `, com entrada às ${res.rebalance.startTime}` : ""}.`,
        );
      } else if (res.rebalance?.kind === "skipped_started") {
        toast.info("As horas de quem ficou não foram recalculadas porque a tarefa já foi iniciada ou concluída.");
      }
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Anexos NÃO impedem a exclusão de uma tarefa não iniciada: o modal apenas
  // informa o gestor de que existem ficheiros e a exclusão segue em frente.
  const { data: deletingDocsCount } = useQuery({
    queryKey: ["task-documents-count", deleting?.id],
    queryFn: async () => {
      if (!deleting?.id) return 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase.from("task_documents" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("task_id", deleting.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!deleting?.id && !deleting?.recurrence_id,
    refetchOnWindowFocus: false,
  });

  // Colegas da mesma tarefa em equipa (mesmo task_group_id e mesmo dia): o gestor
  // escolhe no modal quem também sai. Por padrão só a tarefa clicada é excluída.
  const { data: deletingGroupRows } = useQuery({
    queryKey: ["task-group-mates", deleting?.id, deleting?.task_group_id],
    queryFn: async (): Promise<TaskRow[]> => {
      if (!deleting?.task_group_id) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("task_group_id", deleting.task_group_id)
        .is("deleted_at", null)
        .neq("id", deleting.id);
      if (error) throw error;
      const dayKey = (row: Pick<TaskRow, "recurrence_date" | "scheduled_for" | "due_at">) =>
        row.recurrence_date ?? (row.scheduled_for ?? row.due_at ?? "").slice(0, 10);
      const key = dayKey(deleting);
      return ((data ?? []) as unknown as TaskRow[]).filter((row) => dayKey(row) === key);
    },
    enabled: isManager && !!deleting?.task_group_id,
    refetchOnWindowFocus: false,
  });
  const [deleteMatesSelected, setDeleteMatesSelected] = useState<string[]>([]);
  useEffect(() => {
    setDeleteMatesSelected([]);
  }, [deleting?.id]);

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
        ? (addWallMinutes(dateKey, "00:00", 24 * 60)?.date ?? dateKey)
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
  // Anexos não bloqueiam: apenas o histórico real de ponto é validado no
  // servidor. O modal informa o gestor quando existem ficheiros anexados.
  const DELETABLE_STATUSES: TaskRow["status"][] = ["pendente", "autorizado", "cancelado", "ausente"];

  const canDelete = (t: TaskRow) => isManager && DELETABLE_STATUSES.includes(t.status);
  const memberDisplayName = (id: string | null | undefined) =>
    (id && members?.find((m) => m.id === id)?.full_name) || "Funcionário";
  const deletingGroupMates: GroupMate[] = (deletingGroupRows ?? []).map((row) => {
    const blocked = !deleting?.recurrence_id && !canDelete(row);
    return {
      taskId: row.id,
      name: memberDisplayName(row.assigned_to),
      disabled: blocked,
      note: blocked ? "já tem histórico, não pode ser excluída" : undefined,
    };
  });

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
        const isOtherUser = isManager && task.assigned_to !== user?.id;
        if (isOtherUser) {
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
  /**
   * ADR-062 — a recusa passa sempre pela RPC canónica. O pedido de alteração de
   * data/hora e a sugestão de responsável são informativos: nada é reagendado
   * nem reatribuído automaticamente.
   */
  const submitRefusal = (payload: RefusalSubmitPayload) => {
    if (!refusing) return;
    transition.mutate({
      id: refusing.id,
      action: "recusar",
      reason: payload.reason,
      requestedDate: payload.requestedDate,
      requestedTime: payload.requestedTime,
      needsReassignment: payload.requestedDate ? !!payload.needsReassignment : undefined,
      suggestedEmployeeName: payload.suggestedEmployeeName,
    });
  };

  // Filtros derivados (status + funcionário) — Fase F.
  const filteredTasks = useMemo(() => {
    const base = tasks ?? [];
    const all = focusTaskExtra && !base.some((t) => t.id === focusTaskExtra.id) ? [...base, focusTaskExtra] : base;
    const selectedEmployees = new Set(selectedEmployeeIds);
    const selectedClients = new Set(selectedClientIds);
    return all.filter((t) => {
      // A tarefa aberta pela notificação aparece sempre; as demais seguem os filtros normais.
      if (search.task && t.id === search.task) return true;
      if (selectedEmployees.size > 0 && (!t.assigned_to || !selectedEmployees.has(t.assigned_to))) return false;
      if (selectedClients.size > 0 && (!t.client_id || !selectedClients.has(t.client_id))) return false;
      // Dia operacional (agendamento / ocorrência / prazo), nunca created_at.
      if (search.date && taskOperationalDay(t) !== search.date) return false;
      if (!search.status) return true;
      // Mesma classificação exclusiva usada pelos cartões do Dashboard.
      if (search.status === "atrasadas") return matchesDashboardBucket(t, "atrasada");
      if (search.status === "canceladas")
        return matchesDashboardBucket(t, "cancelada") || matchesDashboardBucket(t, "recusada");
      if (search.status === "recusadas") return matchesDashboardBucket(t, "recusada");
      if (search.status === "pendente") return matchesDashboardBucket(t, "pendente");
      if (search.status === "em_andamento") return matchesDashboardBucket(t, "em_andamento");
      if (search.status === "concluido") return matchesDashboardBucket(t, "concluido");
      return t.status === search.status;
    });
  }, [
    tasks,
    search.status,
    search.employee,
    search.client,
    search.task,
    search.date,
    selectedEmployeeIds,
    selectedClientIds,
    focusTaskExtra,
  ]);

  const filteredCalendarData = useMemo(
    () => filterCalendarData(filteredTasks, approvedVacations ?? [], selectedEmployeeIds),
    [filteredTasks, approvedVacations, selectedEmployeeIds],
  );

  const orderedTasks = useMemo(() => sortTasksForList(filteredTasks), [filteredTasks]);

  // Notificação: rola até a tarefa (lista ou calendário), pisca e deixa marcada.
  useEffect(() => {
    if (!search.task || isLoading) return;
    const selector = `[data-task-id="${CSS.escape(search.task)}"]`;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        window.clearInterval(timer);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
        el.classList.add("ring-4", "ring-primary", "ring-offset-2", "rounded-lg", "bg-primary/10", "animate-pulse");
        window.setTimeout(() => el.classList.remove("animate-pulse"), 4500);
      } else if (tries > 30) {
        window.clearInterval(timer);
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, [search.task, isLoading, taskView, filteredTasks.length]);

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
  // Troca de empresa ativa: descarta a seleção de clientes da empresa anterior.
  const lastCompanyRef = useRef(currentCompanyId);
  useEffect(() => {
    if (lastCompanyRef.current === currentCompanyId) return;
    lastCompanyRef.current = currentCompanyId;
    if (search.client) {
      void navigate({ search: (prev: TasksSearch) => ({ ...prev, client: undefined }), replace: true });
    }
  }, [currentCompanyId, search.client, navigate]);
  const setClientFilter = (next: string[] | undefined) => {
    void navigate({
      search: (prev: TasksSearch) => ({ ...prev, client: next?.length ? next.join(",") : undefined }),
      replace: true,
    });
  };

  return (
    <div className="space-y-6">
      {search.task && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">A tarefa aberta pela notificação está destacada na tela.</span>
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-2"
            onClick={() =>
              void navigate({ search: (prev: TasksSearch) => ({ ...prev, task: undefined }), replace: true })
            }
          >
            Limpar destaque
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
            <Dialog
              open={open}
              onOpenChange={(v) => {
                // Fechar por ESC/clique fora: mantém o rascunho com open:false.
                if (!v && taskDraftValues && taskDraftDirty) taskDraft.save(taskDraftValues, { open: false });
                setOpen(v);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Nova tarefa
                </Button>
              </DialogTrigger>
              <DialogContent size="lg">
                <ModalHeader
                  icon={ListTodo}
                  title="Nova tarefa"
                  description="Crie uma tarefa e atribua a um colaborador."
                />
                <TaskForm
                  formId="task-form-create"
                  members={withMemberDetails(activeMembers ?? [])}
                  clients={clientsList ?? []}
                  companyId={currentCompanyId}
                  userId={user!.id}
                  draftValues={taskDraft.restored}
                  draftSavedAt={taskDraft.savedAt}
                  draftConflict={taskDraft.conflict}
                  onDraftValues={handleTaskDraftValues}
                  onDraftDiscard={clearTaskDraft}
                  onCancel={() => {
                    clearTaskDraft();
                    setOpen(false);
                  }}
                  onDone={() => {
                    clearTaskDraft();
                    setOpen(false);
                    qc.invalidateQueries({ queryKey: ["tasks"] });
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          // Fechar por ESC/clique fora: mantém o rascunho com open:false.
          if (!v) {
            if (taskDraftValues) taskDraft.save(taskDraftValues, { open: false });
            setEditing(null);
          }
        }}
      >
        <DialogContent size="lg">
          <ModalHeader icon={ListTodo} title="Editar tarefa" description="Atualize os dados e anexos da tarefa." />
          {editing && (
            <TaskForm
              formId="task-form-edit"
              initial={editing}
              members={withMemberDetails([
                ...(activeMembers ?? []),
                ...(members ?? []).filter(
                  (m) => m.id === editing.assigned_to && !(activeMembers ?? []).some((active) => active.id === m.id),
                ),
              ])}
              clients={clientsList ?? []}
              companyId={editing.company_id}
              userId={user!.id}
              draftValues={taskDraft.restored}
              draftSavedAt={taskDraft.savedAt}
              draftConflict={taskDraft.conflict}
              onDraftValues={handleTaskDraftValues}
              onDraftDiscard={clearTaskDraft}
              onCancel={() => {
                clearTaskDraft();
                setEditing(null);
              }}
              onDone={() => {
                clearTaskDraft();
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
        members={activeMembers ?? []}
        currentAssigneeName={reassigning ? taskMemberName(members ?? [], reassigning.assigned_to) : null}
        open={!!reassigning}
        onOpenChange={(v) => !v && setReassigning(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["tasks"] })}
      />

      <EditRecurrenceDialog
        recurrence={seriesRow}
        task={editingSeries}
        members={[
          ...(activeMembers ?? []),
          ...(members ?? [])
            .filter((m) => m.id === editingSeries?.assigned_to && !(activeMembers ?? []).some((a) => a.id === m.id))
            .map((m) => ({ ...m, is_active: false })),
        ]}
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
        groupMates={deletingGroupMates}
        currentName={deleting ? memberDisplayName(deleting.assigned_to) : undefined}
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
            {(deletingDocsCount ?? 0) > 0 && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                Atenção: esta tarefa tem {deletingDocsCount} {deletingDocsCount === 1 ? "anexo" : "anexos"}. Ao
                confirmar, a tarefa e os anexos serão excluídos.
              </p>
            )}
            <GroupMatesPicker
              mates={deletingGroupMates}
              selected={deleteMatesSelected}
              onChange={setDeleteMatesSelected}
              currentName={deleting ? memberDisplayName(deleting.assigned_to) : undefined}
            />
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTask.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteTask.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) deleteTask.mutate([deleting.id, ...deleteMatesSelected]);
              }}
            >
              {deleteTask.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!bulkAction}
        onOpenChange={(open) => !open && !bulkActionMut.isPending && setBulkAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "archive" ? "Arquivar tarefas selecionadas?" : "Excluir tarefas selecionadas?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "archive"
                ? `${bulkArchiveTasks.length} tarefa(s) única(s) serão arquivadas. Recorrências não participam desta ação.`
                : `${bulkDeleteTasks.length} tarefa(s) única(s) serão excluídas pelo fluxo seguro existente. Recorrências não participam desta ação.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActionMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                bulkActionMut.isPending ||
                (bulkAction === "archive" ? bulkArchiveTasks.length === 0 : bulkDeleteTasks.length === 0)
              }
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
          <ModalHeader
            icon={FileText}
            title="Motivo de não ter iniciado"
            description="Registe uma justificativa operacional sem criar ponto ou horário fictício."
          />
          <ModalBody>
            <Label htmlFor="no-start-reason">Motivo</Label>
            <Textarea
              id="no-start-reason"
              value={noStartReason}
              onChange={(event) => setNoStartReason(event.target.value)}
              placeholder="Ex.: Estava sem internet."
              className="mt-2 min-h-28"
            />
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNoStartTarget(null)}
              disabled={noStartMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => noStartTarget && noStartMut.mutate({ taskId: noStartTarget.id, reason: noStartReason })}
              disabled={noStartMut.isPending || !noStartReason.trim()}
            >
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
          <ModalHeader
            icon={Check}
            title="Concluir tarefa"
            description="Registre uma observação opcional sobre a conclusão."
          />
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
            <Button
              type="button"
              variant="outline"
              disabled={completeTask.isPending}
              onClick={() => setCompleting(null)}
            >
              Cancelar
            </Button>
            <Button type="submit" form="task-completion-form" disabled={completeTask.isPending}>
              <Check className="mr-2 h-4 w-4" />
              {completeTask.isPending ? "Concluindo..." : "Concluir tarefa"}
            </Button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

      <RefuseTaskDialog
        task={refusing}
        clientName={refusing?.client_id ? clientsList?.find((c) => c.id === refusing.client_id)?.name : undefined}
        open={!!refusing}
        onOpenChange={(v) => !v && setRefusing(null)}
        pending={transition.isPending}
        onConfirm={submitRefusal}
      />

      {!currentCompanyId && isManager && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
          {isSuperAdmin
            ? "Selecione uma empresa ativa para visualizar e gerir as tarefas desse contexto."
            : "Sua empresa ainda está aguardando aprovação. Você poderá criar tarefas assim que for liberada."}
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      )}
      {!isManager && !isLoading && (
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card px-3 py-2">
          <FilterChip label="Lista" active={taskView === "list"} onClick={() => setTaskView("list")} />
          <FilterChip label="Calendário" active={taskView === "calendar"} onClick={() => setTaskView("calendar")} />
        </div>
      )}
      {isManager && currentCompanyId && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <FilterChip label="Lista" active={taskView === "list"} onClick={() => setTaskView("list")} />
            <FilterChip label="Calendário" active={taskView === "calendar"} onClick={() => setTaskView("calendar")} />
          </div>
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
          <div className="flex flex-wrap items-center gap-1">
            <FilterChip label="Todos" active={!search.status} onClick={() => setStatusFilter(undefined)} />
            {(
              [
                ["pendente", "Pendentes"],
                ["em_andamento", "Em andamento"],
                ["concluido", "Concluídas"],
                ["atrasadas", "Atrasadas"],
                ["ausente", "Ausentes"],
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
            {search.date && (
              <FilterChip
                label={`Dia ${formatWallDate(`${search.date}T00:00:00.000Z`)} ✕`}
                active
                onClick={() =>
                  void navigate({ search: (prev: TasksSearch) => ({ ...prev, date: undefined }), replace: true })
                }
              />
            )}
          </div>
          <div className="ml-auto grid w-full gap-2 sm:w-auto sm:grid-cols-2">
            <EmployeeMultiPicker
              employees={(members ?? []).map((m) => ({
                id: m.id,
                full_name: taskMemberName(members ?? [], m.id, "Funcionário"),
                job_title: (m as { job_title?: string | null }).job_title ?? null,
                sector: memberSectors?.[m.id] ?? null,
                team_number: memberTeams?.[m.id] ?? null,
              }))}
              values={selectedEmployeeIds}
              onValuesChange={setEmployeeFilter}
              placeholder="Todos os funcionários"
              ariaLabel="Filtrar por funcionário"
            />
            <MultiClientSelect
              clients={clientsList ?? []}
              values={selectedClientIds}
              onValuesChange={setClientFilter}
              loading={clientsLoading}
              error={clientsError}
              onRetry={() => void refetchClients()}
            />
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

      {!isLoading && filteredTasks.length === 0 && selectedClientIds.length > 0 && (
        <ClientFilterEmptyState
          withOtherFilters={!!search.status || selectedEmployeeIds.length > 0}
          onClear={() => setClientFilter(undefined)}
        />
      )}
      {!isLoading && filteredTasks.length === 0 && selectedClientIds.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          {view === "archived"
            ? "Nenhuma tarefa arquivada."
            : search.status || selectedEmployeeIds.length > 0 || search.client
              ? "Nenhuma tarefa corresponde ao filtro atual."
              : "Nenhuma tarefa ainda."}
        </div>
      )}

      {!isLoading && filteredTasks.length > 0 && taskView === "list" && (
        <TaskListSections
          tasks={orderedTasks}
          splitCompleted={!search.status}
          members={members ?? []}
          clients={clientsList ?? []}
          groupBy={isManager ? calendarGroup : "all"}
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
          groupMemberNames={groupMemberNames}
          selectedTaskIds={new Set(selectedTaskIds)}
          taskPunches={taskPunchByTask}
          onToggleTaskSelection={(id) =>
            setSelectedTaskIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
          }
          onNoStartReason={setNoStartTarget}
        />
      )}

      {!isLoading &&
        (filteredCalendarData.tasks.length > 0 || (!search.status && filteredCalendarData.vacations.length > 0)) &&
        isManager &&
        taskView === "calendar" && (
          <TaskPlanningCalendar
            tasks={filteredCalendarData.tasks}
            // SUP-249: com filtro de estado (ex.: Em andamento) mostra só quem tem tarefas nesse estado.
            vacations={search.status ? [] : filteredCalendarData.vacations}
            members={members ?? []}
            clients={clientsList ?? []}
            groupBy={calendarGroup}
            clientFilterActive={selectedClientIds.length > 0}
            otherFiltersActive={!!search.status || selectedEmployeeIds.length > 0}
            onClearClientFilter={() => setClientFilter(undefined)}
            seedAssigneeIds={
              calendarGroup === "assignee"
                ? selectedEmployeeIds.length > 0
                  ? selectedEmployeeIds
                  : // SUP-249: com filtro de estado (ex.: Em andamento vindo do Dashboard) mostra só
                    // quem tem tarefas nesse estado; sem filtro, todos os colaboradores ativos.
                    search.status
                    ? []
                    : (activeMembers ?? []).map((m) => m.id)
                : []
            }

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
            groupMemberNames={groupMemberNames}
            selectedTaskIds={new Set(selectedTaskIds)}
            taskPunches={taskPunchByTask}
            onToggleTaskSelection={(id) =>
              setSelectedTaskIds((current) =>
                current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
              )
            }
            onNoStartReason={setNoStartTarget}
          />
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
            groupBy="all"
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
            groupMemberNames={groupMemberNames}
            selectedTaskIds={new Set(selectedTaskIds)}
            taskPunches={taskPunchByTask}
            onToggleTaskSelection={(id) =>
              setSelectedTaskIds((current) =>
                current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
              )
            }
            onNoStartReason={setNoStartTarget}
          />
        )}
    </div>
  );
}
