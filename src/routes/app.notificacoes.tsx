import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Bell,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Send,
  ShieldCheck,
  Timer,
  X as XIcon,
} from "lucide-react";
import { transitionTask } from "@/lib/tasks";
import { useRealtimeInvalidate } from "@/lib/realtime/subscribe";
import { invalidateNotificationsCache } from "@/lib/cache/notifications";
import {
  canManageNotification,
  canOpenNotification,
  resolveNotificationDestination,
  resolveNotificationActions,
} from "@/lib/notification-actions";
import { taskRejectionNotificationDetails } from "@/lib/task-refusal-view";
import { taskCancellationNotificationDetails } from "@/lib/task-cancellation-notification";
import { ticketNotificationDisplay, type TicketNotificationIdentity } from "@/lib/support/ticket-notification";

type NotificationEvent =
  | "task_created"
  | "task_assigned"
  | "task_authorization_requested"
  | "task_authorized"
  | "task_rejected"
  | "task_started"
  | "task_completed"
  | "task_cancelled"
  | "task_marked_absent"
  | "task_late"
  | "vacation_requested"
  | "vacation_approved"
  | "vacation_rejected"
  | "vacation_awaiting_approval"
  | "vacation_cancelled"
  | "vacation_confirmation_required"
  | "vacation_confirmed"
  | "vacation_declined"
  | "expense_created"
  | "expense_approved"
  | "expense_rejected"
  | "ticket_created"
  | "ticket_message_added"
  | "task_client_instructions_updated"
  | "task_deleted"
  | "extra_work_invite"
  | "extra_work_accepted"
  | "extra_work_declined"
  | "extra_work_filled";

type NotificationPriority = "baixa" | "media" | "alta" | "urgente";

/** ADR-043 — estados de gestão da notificação (SUP-2026-000095). */
type NotificationState = "nova" | "em_tratamento" | "encaminhada" | "resolvida" | "arquivada";

type NotificationRow = {
  id: string;
  company_id: string;
  user_id: string;
  task_id: string | null;
  event: NotificationEvent;
  title: string;
  body: string | null;
  priority: NotificationPriority;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  state: NotificationState;
  forwarded_to: string | null;
  state_note: string | null;
  state_changed_at: string | null;
  /** Quem pôs no estado atual (em tratamento / encaminhada / resolvida). */
  state_changed_by?: string | null;
  resolved_by?: string | null;
};

type VacationQueueRow = {
  id: string;
  vacation_request_id: string;
  company_id: string;
  state: "pending" | "in_progress";
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  employeeName: string;
  startDate: string;
  endDate: string;
};

type CancellationTaskContext = {
  id: string;
  title: string | null;
  client_id: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  schedule_change_requested_date?: string | null;
  schedule_change_needs_reassignment?: boolean | null;
  client?: { name?: string | null } | null;
};

type SupportTicketContext = {
  id: string;
  ticket_number: string;
  requester_user_id: string;
};

type SupportMessageContext = {
  id: string;
  ticket_id: string;
  author_user_id: string;
  created_at: string;
};

function relatedClientName(value: unknown): string | null {
  if (Array.isArray(value)) return relatedClientName(value[0]);
  if (!value || typeof value !== "object") return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

type CompletionNotificationDetails = {
  actorName: string | null;
  taskTitle: string | null;
  clientName: string | null;
  note: string | null;
  completedAt: string | null;
};

function completionNotificationDetails(row: NotificationRow): CompletionNotificationDetails | null {
  if (row.event !== "task_completed") return null;
  const metadata = row.metadata ?? {};
  const note = typeof metadata.completion_note === "string" ? metadata.completion_note.trim() : "";
  if (!note) return null;
  return {
    actorName: typeof metadata.employee_name === "string" ? metadata.employee_name : null,
    taskTitle: typeof metadata.task_title === "string" ? metadata.task_title : null,
    clientName: typeof metadata.client_name === "string" ? metadata.client_name : null,
    note,
    completedAt: typeof metadata.completion_note_at === "string" ? metadata.completion_note_at : null,
  };
}

/** Completa notificacoes antigas que foram criadas antes do payload de cancelamento.
 *  A busca e em lote e respeita os filtros de empresa da consulta principal. */
async function enrichLegacyCancellationNotifications(rows: NotificationRow[]): Promise<NotificationRow[]> {
  const taskIds = [
    ...new Set(
      rows
        .filter((row) => row.event === "task_cancelled" && row.task_id && !row.metadata?.cancelled_by_name)
        .map((row) => row.task_id as string),
    ),
  ];
  if (taskIds.length === 0) return rows;

  const { data: taskData, error: taskError } = await supabase
    .from("tasks")
    .select("id,title,client_id,cancellation_reason,cancelled_at,cancelled_by,client:clients(name)")
    .in("id", taskIds);
  if (taskError) return rows;

  const taskById = new Map(((taskData ?? []) as unknown as CancellationTaskContext[]).map((task) => [task.id, task]));
  const actorIds = [
    ...new Set([...taskById.values()].map((task) => task.cancelled_by).filter((id): id is string => !!id)),
  ];
  const { data: actorData } = actorIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const actorById = new Map(
    ((actorData ?? []) as { id: string; full_name: string | null }[]).map((actor) => [actor.id, actor.full_name]),
  );

  return rows.map((row) => {
    if (row.event !== "task_cancelled" || !row.task_id || row.metadata?.cancelled_by_name) return row;
    const task = taskById.get(row.task_id);
    if (!task) return row;
    const actorName = task.cancelled_by ? actorById.get(task.cancelled_by) : null;
    if (!actorName && !task.cancelled_by) return row;
    return {
      ...row,
      metadata: {
        ...row.metadata,
        cancelled_by: task.cancelled_by,
        cancelled_by_name: actorName || "Usuario",
        cancellation_reason: task.cancellation_reason,
        cancelled_at: task.cancelled_at,
        client_id: task.client_id,
        client_name: relatedClientName(task.client),
        task_id: task.id,
        task_title: task.title,
        link: `/app/tarefas?task=${task.id}`,
      },
    };
  });
}

function supportTicketId(row: NotificationRow): string | null {
  // Todos os eventos de ticket (criado, mensagem, atualizado, reaberto, status, resolvido) abrem o ticket.
  if (!row.event.startsWith("ticket_")) return null;
  const metadataId = row.metadata?.ticket_id;
  return typeof metadataId === "string" && metadataId.trim() ? metadataId : row.task_id;
}

/** Resolve ticket actors in one batch. New rows carry actor metadata from the
 * database; legacy rows are completed from their ticket/message relationships. */
async function enrichTicketNotifications(
  rows: NotificationRow[],
  companyId: string | null,
): Promise<NotificationRow[]> {
  const ticketIds = [...new Set(rows.map(supportTicketId).filter((id): id is string => !!id))];
  if (ticketIds.length === 0) return rows;

  let ticketQuery = supabase.from("support_tickets").select("id,ticket_number,requester_user_id").in("id", ticketIds);
  if (companyId) ticketQuery = ticketQuery.eq("company_id", companyId);
  const { data: ticketData } = await ticketQuery;
  const tickets = (ticketData ?? []) as SupportTicketContext[];
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));

  const { data: messageData } = await supabase
    .from("support_ticket_messages")
    .select("id,ticket_id,author_user_id,created_at")
    .in(
      "ticket_id",
      tickets.map((ticket) => ticket.id),
    )
    .eq("is_internal", false)
    .order("created_at", { ascending: true });
  const messages = (messageData ?? []) as SupportMessageContext[];
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const actorIds = new Set<string>();

  for (const row of rows) {
    const ticketId = supportTicketId(row);
    const ticket = ticketId ? ticketById.get(ticketId) : undefined;
    const actorId = typeof row.metadata?.actor_id === "string" ? row.metadata.actor_id : null;
    const messageId = typeof row.metadata?.message_id === "string" ? row.metadata.message_id : null;
    const message = messageId
      ? messageById.get(messageId)
      : messages.filter((item) => item.ticket_id === ticketId && item.created_at <= row.created_at).at(-1);
    const resolvedActorId =
      actorId ?? (row.event === "ticket_created" ? ticket?.requester_user_id : message?.author_user_id);
    if (resolvedActorId) actorIds.add(resolvedActorId);
  }

  const { data: actorData } = actorIds.size
    ? await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", [...actorIds])
    : { data: [] as { id: string; full_name: string | null }[] };
  const actorById = new Map(
    ((actorData ?? []) as { id: string; full_name: string | null }[]).map((actor) => [actor.id, actor]),
  );

  return rows.map((row) => {
    const ticketId = supportTicketId(row);
    if (!ticketId) return row;
    const ticket = ticketById.get(ticketId);
    const actorId = typeof row.metadata?.actor_id === "string" ? row.metadata.actor_id : null;
    const messageId = typeof row.metadata?.message_id === "string" ? row.metadata.message_id : null;
    const message = messageId
      ? messageById.get(messageId)
      : messages.filter((item) => item.ticket_id === ticketId && item.created_at <= row.created_at).at(-1);
    const resolvedActorId =
      actorId ?? (row.event === "ticket_created" ? ticket?.requester_user_id : message?.author_user_id);
    const actor = resolvedActorId ? actorById.get(resolvedActorId) : undefined;
    const identity: TicketNotificationIdentity = {
      fullName: actor?.full_name,
      email: typeof row.metadata?.actor_email === "string" ? row.metadata.actor_email : null,
    };
    const details = ticketNotificationDisplay(
      row.event as "ticket_created" | "ticket_message_added",
      {
        ...row.metadata,
        ticket_number: row.metadata?.ticket_number ?? ticket?.ticket_number,
        actor_id: resolvedActorId ?? row.metadata?.actor_id,
        actor_name: row.metadata?.actor_name ?? actor?.full_name,
      },
      row.title,
      row.body,
      identity,
    );

    return details
      ? {
          ...row,
          metadata: {
            ...row.metadata,
            actor_id: resolvedActorId,
            actor_name: details.actorName,
            ticket_number: ticket?.ticket_number ?? row.metadata?.ticket_number,
          },
        }
      : row;
  });
}

const STATE_LABEL: Record<NotificationState, string> = {
  nova: "Nova",
  em_tratamento: "Em tratamento",
  encaminhada: "Encaminhada",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

const STATE_TONE: Record<NotificationState, string> = {
  nova: "bg-primary/15 text-primary",
  em_tratamento: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  encaminhada: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  resolvida: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  arquivada: "bg-muted text-muted-foreground",
};

type TabKey = "ativas" | "tratamento" | "resolvidas" | "arquivadas" | "todas";

const TABS: { key: TabKey; label: string; states: NotificationState[] | null }[] = [
  { key: "ativas", label: "Caixa de entrada", states: ["nova"] },
  { key: "tratamento", label: "Em tratamento", states: ["em_tratamento", "encaminhada"] },
  { key: "resolvidas", label: "Resolvidas", states: ["resolvida"] },
  { key: "arquivadas", label: "Arquivadas", states: ["arquivada"] },
  { key: "todas", label: "Todas", states: null },
];

/** Sugestões rápidas de destinatário no encaminhamento. */
const FORWARD_SUGGESTIONS = ["Contabilista", "Gestor", "Recursos Humanos", "Direção"];

const EVENT_LABEL: Record<NotificationEvent, string> = {
  task_created: "Nova tarefa",
  task_assigned: "Atribuição",
  task_authorization_requested: "Pedido de autorização",
  task_authorized: "Autorizada",
  task_rejected: "Rejeitada",
  task_started: "Iniciada",
  task_completed: "Concluída",
  task_cancelled: "Cancelada",
  task_marked_absent: "Ausente",
  task_late: "Atrasada",
  task_client_instructions_updated: "Instruções do cliente",
  task_deleted: "Excluída",
  extra_work_invite: "Trabalho extra — convite",
  extra_work_accepted: "Trabalho extra — aceite",
  extra_work_declined: "Trabalho extra — recusa",
  extra_work_filled: "Trabalho extra — vagas preenchidas",
  vacation_requested: "Férias — solicitação",
  vacation_approved: "Férias — aprovadas",
  vacation_rejected: "Férias — rejeitadas",
  vacation_awaiting_approval: "Férias — aguardando aprovação",
  vacation_cancelled: "Férias — canceladas",
  vacation_confirmation_required: "Férias — confirmar",
  vacation_confirmed: "Férias — confirmadas",
  vacation_declined: "Férias — recusadas",
  expense_created: "Despesa — solicitação",
  expense_approved: "Despesa — aprovada",
  expense_rejected: "Despesa — rejeitada",
  ticket_created: "Ticket — aberto",
  ticket_message_added: "Ticket — resposta",
};

const PRIORITY_TONE: Record<NotificationPriority, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-secondary text-secondary-foreground",
  alta: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgente: "bg-destructive/15 text-destructive",
};

export const Route = createFileRoute("/app/notificacoes")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user, currentCompanyId, isManager, isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("ativas");
  const [forwardTarget, setForwardTarget] = useState<NotificationRow | null>(null);
  const [forwardTo, setForwardTo] = useState("");
  const [forwardNote, setForwardNote] = useState("");

  const { data: vacationQueue = [], isLoading: vacationQueueLoading } = useQuery({
    queryKey: ["vacation-manager-queue", user?.id, currentCompanyId],
    enabled: !!user && !!currentCompanyId && (isManager || isSuperAdmin),
    queryFn: async () => {
      const { data: queueData, error: queueError } = await (supabase as any)
        .from("vacation_manager_queue")
        .select("id,vacation_request_id,company_id,state,claimed_by,claimed_at,created_at")
        .eq("company_id", currentCompanyId)
        .eq("kind", "queue")
        .neq("state", "resolved")
        .order("created_at", { ascending: false });
      if (queueError) throw queueError;
      const queue = (queueData ?? []) as Omit<VacationQueueRow, "employeeName" | "startDate" | "endDate">[];
      if (queue.length === 0) return [] as VacationQueueRow[];
      const { data: requests, error: requestError } = await supabase
        .from("vacation_requests")
        .select("id,user_id,start_date,end_date")
        .in(
          "id",
          queue.map((item) => item.vacation_request_id),
        );
      if (requestError) throw requestError;
      const requestMap = new Map((requests ?? []).map((request) => [request.id, request]));
      const employeeIds = [...new Set((requests ?? []).map((request) => request.user_id))];
      const { data: profiles, error: profileError } = employeeIds.length
        ? await supabase.from("profiles").select("id,full_name").in("id", employeeIds)
        : { data: [] as { id: string; full_name: string | null }[], error: null };
      if (profileError) throw profileError;
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? "Colaborador"]));
      return queue.flatMap((item) => {
        const request = requestMap.get(item.vacation_request_id);
        if (!request) return [];
        return [
          {
            ...item,
            employeeName: names.get(request.user_id) ?? "Colaborador",
            startDate: request.start_date,
            endDate: request.end_date,
          },
        ];
      });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", user?.id, currentCompanyId],
    queryFn: async () => {
      const query = supabase
        .from("notifications" as never)
        .select("*")
        .eq("user_id", user!.id);
      if (currentCompanyId) query.eq("company_id", currentCompanyId);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const rows = await enrichLegacyCancellationNotifications((data ?? []) as unknown as NotificationRow[]);
      return enrichTicketNotifications(rows, currentCompanyId);
    },
    enabled: !!user,
  });

  // Nomes de quem trata/resolve (as cópias dos outros gestores mostram "Em tratamento por Fulano").
  const handlerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of (data ?? []) as NotificationRow[]) {
      const h = n.state === "resolvida" ? (n.resolved_by ?? n.state_changed_by) : n.state_changed_by;
      if (h && h !== user?.id) ids.add(h);
    }
    return Array.from(ids).sort();
  }, [data, user?.id]);
  const { data: handlerNames } = useQuery({
    queryKey: ["notification-handlers", handlerIds],
    enabled: handlerIds.length > 0,
    queryFn: async () => {
      const { data: profs, error } = await supabase.from("profiles").select("id,full_name").in("id", handlerIds);
      if (error) throw error;
      return new Map(
        ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? ""]),
      );
    },
  });

  // Realtime unificado (Fase 4): infra em `src/lib/realtime/subscribe.ts`
  // + helper de cache central em `src/lib/cache/notifications.ts`.
  useRealtimeInvalidate({
    channel: `user:${user?.id ?? "anon"}:notifications:${currentCompanyId ?? "all"}`,
    table: "notifications",
    filter: user ? `user_id=eq.${user.id}` : undefined,
    enabled: !!user,
    queryClient: qc,
    invalidate: invalidateNotificationsCache,
  });

  useRealtimeInvalidate({
    channel: `company:${currentCompanyId ?? "none"}:vacation-manager-queue`,
    table: "vacation_manager_queue",
    filter: currentCompanyId ? `company_id=eq.${currentCompanyId}` : undefined,
    enabled: !!currentCompanyId && (isManager || isSuperAdmin),
    queryClient: qc,
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: ["vacation-manager-queue"] });
      client.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const claimVacation = useMutation({
    mutationFn: async (queueId: string) => {
      const { error } = await (supabase as any).rpc("vacation_manager_queue_claim", { _queue_id: queueId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vacation-manager-queue"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      toast.success("Pedido assumido. Agora só aparece para si.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Atualização imediata da lista e do sino; o refetch do servidor confirma em seguida.
  const notificationsKey = ["notifications", user?.id, currentCompanyId];
  const patchNotificationRow = (id: string, patch: (row: NotificationRow) => NotificationRow) =>
    qc.setQueryData<NotificationRow[]>(notificationsKey, (old) =>
      old ? old.map((row) => (row.id === id ? patch(row) : row)) : old,
    );
  const decrementUnreadBadge = () =>
    qc.setQueriesData<number>({ queryKey: ["notifications-unread-count"] }, (old) =>
      typeof old === "number" ? Math.max(0, old - 1) : old,
    );
  const isActiveUnread = (row?: NotificationRow) =>
    !!row && !row.read_at && row.state !== "resolvida" && row.state !== "arquivada";

  const markRead = useMutation({
    mutationFn: async (id: string | null) => {
      const { error } = await supabase.rpc(
        "notification_mark_read" as never,
        (id ? { _id: id, _all: false } : { _all: true }) as never,
      );
      if (error) throw error;
    },
    onMutate: async (id: string | null) => {
      if (!id) return;
      await qc.cancelQueries({ queryKey: notificationsKey });
      const target = qc.getQueryData<NotificationRow[]>(notificationsKey)?.find((row) => row.id === id);
      if (!target || target.read_at) return;
      patchNotificationRow(id, (row) => ({ ...row, read_at: new Date().toISOString() }));
      if (isActiveUnread(target)) decrementUnreadBadge();
    },
    onSuccess: () => invalidateNotificationsCache(qc),
    onError: (e: Error) => {
      invalidateNotificationsCache(qc);
      toast.error(e.message);
    },
  });

  /** ADR-043 — muda o estado de gestão da notificação. */
  const setState = useMutation({
    mutationFn: async (vars: { ids: string[]; state: NotificationState; forwardedTo?: string; note?: string }) => {
      const { error } = await supabase.rpc(
        "notification_set_state" as never,
        {
          _ids: vars.ids,
          _state: vars.state,
          _forwarded_to: vars.forwardedTo ?? null,
          _note: vars.note ?? null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateNotificationsCache(qc);
      toast.success(
        vars.state === "encaminhada"
          ? `Encaminhada a ${vars.forwardedTo}`
          : `Marcada como ${STATE_LABEL[vars.state].toLowerCase()}`,
      );
    },
    onError: (e: Error) =>
      toast.error(e.message === "FORWARD_DESTINATION_REQUIRED" ? "Indique para quem está a encaminhar." : e.message),
  });

  const resolveGroup = useMutation({
    mutationFn: async (notificationId: string) => {
      const { data, error } = await supabase.rpc(
        "notification_resolve_group" as never,
        { _notification_id: notificationId } as never,
      );
      if (error) throw error;
      return Number(data ?? 0);
    },
    onMutate: async (notificationId: string) => {
      await qc.cancelQueries({ queryKey: notificationsKey });
      const target = qc.getQueryData<NotificationRow[]>(notificationsKey)?.find((row) => row.id === notificationId);
      patchNotificationRow(notificationId, (row) => ({
        ...row,
        state: "resolvida",
        read_at: row.read_at ?? new Date().toISOString(),
      }));
      if (isActiveUnread(target)) decrementUnreadBadge();
    },
    onSuccess: (count) => {
      invalidateNotificationsCache(qc);
      toast.success(count > 1 ? "Resolvida para toda a equipa de gestão" : "Notificação resolvida");
    },
    onError: (e: Error) => {
      invalidateNotificationsCache(qc);
      toast.error(e.message.includes("NOT_AUTHORIZED") ? "Sem permissão para resolver esta notificação." : e.message);
    },
  });

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "autorizar" | "cancelar" }) => transitionTask(id, action),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      invalidateNotificationsCache(qc);
      toast.success(vars.action === "autorizar" ? "Tarefa autorizada" : "Solicitação rejeitada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];
  const counts = useMemo(() => {
    const map = {} as Record<TabKey, number>;
    for (const t of TABS) {
      // Caixa de entrada mostra só as NÃO LIDAS; as outras abas mantêm a contagem por estado.
      map[t.key] =
        t.key === "ativas"
          ? rows.filter((n) => (n.state ?? "nova") === "nova" && !n.read_at).length
          : t.states
            ? rows.filter((n) => t.states!.includes(n.state ?? "nova")).length
            : rows.length;
    }
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    const states = TABS.find((t) => t.key === tab)?.states;
    if (!states) return rows;
    return rows.filter((n) => states.includes(n.state ?? "nova"));
  }, [rows, tab]);

  const unreadCount = useMemo(
    () =>
      rows.filter((n) => !n.read_at && n.state !== "resolvida" && n.state !== "arquivada").length +
      vacationQueue.length,
    [rows, vacationQueue.length],
  );

  const openNotification = async (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate(n.id);
    const dest = resolveNotificationDestination(n, supportTicketId(n));
    if (!dest) return;
    if (dest.kind === "ticket") {
      nav({ to: "/app/suporte/$id", params: { id: dest.id } });
    } else if (dest.kind === "task") {
      // SUP-274: o gestor abre a tarefa já filtrada pelo funcionário responsável.
      let employee: string | undefined;
      if (isManager || isSuperAdmin) {
        try {
          const { data: taskRow } = await supabase
            .from("tasks")
            .select("assigned_to")
            .eq("id", dest.taskId)
            .maybeSingle();
          employee = (taskRow as { assigned_to?: string | null } | null)?.assigned_to ?? undefined;
        } catch {
          employee = undefined;
        }
      }
      nav({ to: "/app/tarefas", search: employee ? { task: dest.taskId, employee } : { task: dest.taskId } });
    } else {
      const url = new URL(dest.to, "http://internal");
      const search = Object.fromEntries(url.searchParams.entries());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nav({ to: url.pathname as any, search: (Object.keys(search).length ? search : undefined) as any });
    }
  };

  const openForward = (n: NotificationRow) => {
    setForwardTarget(n);
    setForwardTo(n.forwarded_to ?? "");
    setForwardNote("");
  };

  const confirmForward = () => {
    if (!forwardTarget) return;
    if (!forwardTo.trim()) {
      toast.error("Indique para quem está a encaminhar.");
      return;
    }
    setState.mutate(
      {
        ids: [forwardTarget.id],
        state: "encaminhada",
        forwardedTo: forwardTo.trim(),
        note: forwardNote.trim() || undefined,
      },
      { onSuccess: () => setForwardTarget(null) },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Notificações</h1>
          <p className="mt-1 text-muted-foreground">
            Eventos operacionais em tempo real.{" "}
            {unreadCount > 0 ? (
              <span className="font-medium text-foreground">{unreadCount} não lidas</span>
            ) : (
              <span>Tudo em dia.</span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unreadCount === 0 || markRead.isPending}
          onClick={() => markRead.mutate(null)}
        >
          <CheckCheck className="mr-2 h-4 w-4" /> Marcar todas como lidas
        </Button>
      </div>

      {/* Filtros de estado (ADR-043) */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">{counts[t.key] ?? 0}</span>
          </Button>
        ))}
      </div>

      {tab === "ativas" && vacationQueue.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-muted/40 px-4 py-3">
            <h2 className="font-semibold">Pedidos de férias aguardando gestor</h2>
          </div>
          <ul className="divide-y divide-border">
            {vacationQueue.map((item) => {
              const mine = item.claimed_by === user?.id;
              return (
                <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-warning-foreground">
                        Férias — solicitação
                      </span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
                        {mine ? "Em tratamento" : "Pendente"}
                      </span>
                    </div>
                    <p className="mt-1 font-medium">{item.employeeName}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(`${item.startDate}T00:00:00`).toLocaleDateString("pt-PT")} a{" "}
                      {new Date(`${item.endDate}T00:00:00`).toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!mine && (
                      <Button
                        size="sm"
                        disabled={claimVacation.isPending}
                        onClick={() => {
                          claimVacation.mutate(item.id);
                          nav({ to: "/app/ferias", search: { vacation: item.vacation_request_id } });
                        }}
                      >
                        <Timer className="mr-1.5 h-4 w-4" /> Tratar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => nav({ to: "/app/ferias", search: { vacation: item.vacation_request_id } })}
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {isLoading || vacationQueueLoading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nada por aqui</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta pasta está vazia. Use os estados para manter a caixa de entrada limpa.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {visible.map((n) => {
            const state = n.state ?? "nova";
            // Tratada por outro gestor (cópia partilhada): mostra quem e não oferece "Tratar".
            const handlerId = state === "resolvida" ? (n.resolved_by ?? n.state_changed_by) : n.state_changed_by;
            const handledByOther =
              !!handlerId &&
              handlerId !== user?.id &&
              (state === "em_tratamento" || state === "encaminhada" || state === "resolvida");
            const handlerName = handledByOther ? handlerNames?.get(handlerId!) || "outro gestor" : null;
            const canManage = canManageNotification({
              currentCompanyId,
              isManager,
              isSuperAdmin,
              notificationCompanyId: n.company_id,
            });
            const isAuthReq = n.event === "task_authorization_requested" && canManage;
            const actions = resolveNotificationActions({
              canManage,
              canOpen: canOpenNotification(n, supportTicketId(n)),
              state,
            });
            const refusal = taskRejectionNotificationDetails(n.event, n.metadata);
            const cancellation = taskCancellationNotificationDetails(n.event, n.metadata);
            const completion = completionNotificationDetails(n);
            const ticketDisplay =
              n.event === "ticket_created" || n.event === "ticket_message_added"
                ? ticketNotificationDisplay(n.event, n.metadata, n.title, n.body)
                : null;
            return (
              <li
                key={n.id}
                onClick={(e) => {
                  // Clicar no cartão marca como lida (botões e links mantêm a sua própria ação).
                  if (n.read_at || (e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
                  markRead.mutate(n.id);
                }}
                className={
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between " +
                  (n.read_at ? "bg-background" : "bg-accent/30")
                }
              >
                <div className="flex flex-1 items-start gap-3">
                  <span
                    className={
                      "mt-1 inline-block h-2 w-2 shrink-0 rounded-full " +
                      (n.read_at ? "bg-muted-foreground/30" : "bg-primary")
                    }
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                          PRIORITY_TONE[n.priority]
                        }
                      >
                        {EVENT_LABEL[n.event]}
                      </span>
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide " + STATE_TONE[state]
                        }
                      >
                        {STATE_LABEL[state]}
                        {handlerName ? ` por ${handlerName}` : ""}
                        {state === "encaminhada" && n.forwarded_to ? ` · ${n.forwarded_to}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 font-medium">{ticketDisplay?.title ?? n.title}</p>
                    {refusal ? (
                      <div className="mt-2 space-y-1 border-l-2 border-destructive/30 pl-3 text-sm">
                        <p className="text-muted-foreground">
                          {refusal.employeeName
                            ? `${refusal.employeeName} recusou a tarefa.`
                            : "Tarefa recusada pelo funcionário."}
                        </p>
                        <p className="whitespace-pre-wrap break-words">
                          <span className="font-medium">Motivo da recusa:</span>{" "}
                          {refusal.reason ?? "Motivo não registrado"}
                        </p>
                        {refusal.refusedAt && (
                          <p className="text-xs text-muted-foreground">
                            Recusada em: {new Date(refusal.refusedAt).toLocaleString("pt-PT")}
                          </p>
                        )}
                        {refusal.requestedDate && (
                          <p>
                            <span className="font-medium">Nova data desejada:</span> {refusal.requestedDate}
                            {refusal.requestedTime ? ` · ${refusal.requestedTime}` : ""}
                          </p>
                        )}
                        {refusal.needsReassignment != null && (
                          <p>
                            <span className="font-medium">Reatribuição necessária:</span>{" "}
                            {refusal.needsReassignment ? "Sim" : "Não"}
                          </p>
                        )}
                        {(refusal.suggestedEmployeeName || refusal.suggestedEmployeeId) && (
                          <p>
                            <span className="font-medium">Funcionário sugerido (informativo):</span>{" "}
                            {refusal.suggestedEmployeeName ?? "Sem responsável"}
                          </p>
                        )}
                      </div>
                    ) : cancellation ? (
                      <div className="mt-2 space-y-1 border-l-2 border-destructive/30 pl-3 text-sm">
                        <p>
                          <span className="font-medium">Quem cancelou:</span> {cancellation.actorName}
                          {cancellation.actorRole ? ` (${cancellation.actorRole})` : ""}
                        </p>
                        {cancellation.taskTitle && (
                          <p>
                            <span className="font-medium">Tarefa:</span> {cancellation.taskTitle}
                          </p>
                        )}
                        {cancellation.clientName && (
                          <p>
                            <span className="font-medium">Cliente:</span> {cancellation.clientName}
                          </p>
                        )}
                        <p>
                          <span className="font-medium">Motivo:</span> {cancellation.reason ?? "Motivo não informado"}
                        </p>
                        {cancellation.cancelledAt && (
                          <p className="text-xs text-muted-foreground">
                            Cancelada em: {new Date(cancellation.cancelledAt).toLocaleString("pt-PT")}
                          </p>
                        )}
                        {cancellation.requestedDate && (
                          <p>
                            <span className="font-medium">Nova data desejada:</span> {cancellation.requestedDate}
                          </p>
                        )}
                        {cancellation.needsReassignment != null && (
                          <p>
                            <span className="font-medium">Reatribuição necessária:</span>{" "}
                            {cancellation.needsReassignment ? "Sim" : "Não"}
                          </p>
                        )}
                        {cancellation.suggestedEmployeeName && (
                          <p>
                            <span className="font-medium">Funcionário sugerido (informativo):</span>{" "}
                            {cancellation.suggestedEmployeeName}
                          </p>
                        )}
                      </div>
                    ) : completion ? (
                      <div className="mt-2 space-y-1 border-l-2 border-success/40 pl-3 text-sm">
                        <p className="font-semibold uppercase tracking-wide text-success-foreground">
                          TAREFA CONCLUÍDA COM OBSERVAÇÃO
                        </p>
                        {completion.actorName && (
                          <p>
                            <span className="font-medium">Quem concluiu:</span> {completion.actorName}
                          </p>
                        )}
                        {completion.taskTitle && (
                          <p>
                            <span className="font-medium">Tarefa:</span> {completion.taskTitle}
                          </p>
                        )}
                        {completion.clientName && (
                          <p>
                            <span className="font-medium">Cliente:</span> {completion.clientName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">
                          <span className="font-medium">Observação:</span> {completion.note}
                        </p>
                        {completion.completedAt && (
                          <p className="text-xs text-muted-foreground">
                            Concluída em: {new Date(completion.completedAt).toLocaleString("pt-PT")}
                          </p>
                        )}
                      </div>
                    ) : ticketDisplay ? (
                      ticketDisplay.body && (
                        <p className="mt-0.5 break-words text-sm text-muted-foreground">{ticketDisplay.body}</p>
                      )
                    ) : (
                      n.body && (
                        <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted-foreground">{n.body}</p>
                      )
                    )}
                    {n.state_note && <p className="mt-1 text-xs italic text-muted-foreground">Nota: {n.state_note}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {isAuthReq && n.task_id && (
                    <>
                      <Button
                        size="sm"
                        disabled={transition.isPending}
                        onClick={() => transition.mutate({ id: n.task_id!, action: "autorizar" })}
                      >
                        <ShieldCheck className="mr-1.5 h-4 w-4" /> Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={transition.isPending}
                        onClick={() => transition.mutate({ id: n.task_id!, action: "cancelar" })}
                      >
                        <XIcon className="mr-1.5 h-4 w-4" /> Rejeitar
                      </Button>
                    </>
                  )}
                  {actions.open && (
                    <Button size="sm" variant="ghost" onClick={() => openNotification(n)}>
                      <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir
                    </Button>
                  )}

                  {actions.treat && !(handledByOther && state === "em_tratamento") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setState.isPending}
                      onClick={() => {
                        setState.mutate({ ids: [n.id], state: "em_tratamento" });
                        // Tratar também leva direto ao item (tarefa, férias, despesa, ticket, ponto).
                        void openNotification(n);
                      }}
                    >
                      <Timer className="mr-1.5 h-4 w-4" /> Tratar
                    </Button>
                  )}
                  {actions.forward && (
                    <Button size="sm" variant="ghost" disabled={setState.isPending} onClick={() => openForward(n)}>
                      <Send className="mr-1.5 h-4 w-4" /> Encaminhar
                    </Button>
                  )}
                  {actions.resolve && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={resolveGroup.isPending || setState.isPending}
                      onClick={() => resolveGroup.mutate(n.id)}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Resolvida
                    </Button>
                  )}
                  {actions.archive ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setState.isPending}
                      onClick={() => setState.mutate({ ids: [n.id], state: "arquivada" })}
                    >
                      <Archive className="mr-1.5 h-4 w-4" /> Arquivar
                    </Button>
                  ) : actions.restore ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setState.isPending}
                      onClick={() => setState.mutate({ ids: [n.id], state: "nova" })}
                    >
                      <ArchiveRestore className="mr-1.5 h-4 w-4" /> Restaurar
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!forwardTarget} onOpenChange={(o) => !o && setForwardTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encaminhar notificação</DialogTitle>
            <DialogDescription>
              Registe para quem enviou este assunto. A notificação fica em “Em tratamento” até ser resolvida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forward-to">Enviada a</Label>
              <Input
                id="forward-to"
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
                placeholder="Ex.: Contabilista, Lea, Luc…"
              />
              <div className="flex flex-wrap gap-1.5">
                {FORWARD_SUGGESTIONS.map((s) => (
                  <Button key={s} type="button" size="sm" variant="outline" onClick={() => setForwardTo(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forward-note">Nota (opcional)</Label>
              <Textarea
                id="forward-note"
                value={forwardNote}
                onChange={(e) => setForwardNote(e.target.value)}
                rows={3}
                placeholder="Contexto do encaminhamento"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForwardTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmForward} disabled={setState.isPending}>
              <Send className="mr-1.5 h-4 w-4" /> Encaminhar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
