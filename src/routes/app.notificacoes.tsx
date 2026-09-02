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
  resolveNotificationActions,
} from "@/lib/notification-actions";
import { taskRejectionNotificationDetails } from "@/lib/task-refusal-view";
import { taskCancellationNotificationDetails } from "@/lib/task-cancellation-notification";

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
  | "vacation_cancelled"
  | "vacation_confirmation_required"
  | "vacation_confirmed"
  | "vacation_declined"
  | "expense_created"
  | "expense_approved"
  | "expense_rejected";

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
};

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
  vacation_requested: "Férias — solicitação",
  vacation_approved: "Férias — aprovadas",
  vacation_rejected: "Férias — rejeitadas",
  vacation_cancelled: "Férias — canceladas",
  vacation_confirmation_required: "Férias — confirmar",
  vacation_confirmed: "Férias — confirmadas",
  vacation_declined: "Férias — recusadas",
  expense_created: "Despesa — solicitação",
  expense_approved: "Despesa — aprovada",
  expense_rejected: "Despesa — rejeitada",
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
      return (data ?? []) as unknown as NotificationRow[];
    },
    enabled: !!user,
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

  const markRead = useMutation({
    mutationFn: async (id: string | null) => {
      const { error } = await supabase.rpc(
        "notification_mark_read" as never,
        (id ? { _id: id, _all: false } : { _all: true }) as never,
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateNotificationsCache(qc),
    onError: (e: Error) => toast.error(e.message),
  });

  /** ADR-043 — muda o estado de gestão da notificação. */
  const setState = useMutation({
    mutationFn: async (vars: {
      ids: string[];
      state: NotificationState;
      forwardedTo?: string;
      note?: string;
    }) => {
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
      toast.error(
        e.message === "FORWARD_DESTINATION_REQUIRED"
          ? "Indique para quem está a encaminhar."
          : e.message,
      ),
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
      map[t.key] = t.states ? rows.filter((n) => t.states!.includes(n.state ?? "nova")).length : rows.length;
    }
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    const states = TABS.find((t) => t.key === tab)?.states;
    if (!states) return rows;
    return rows.filter((n) => states.includes(n.state ?? "nova"));
  }, [rows, tab]);

  const unreadCount = useMemo(
    () => rows.filter((n) => !n.read_at && n.state !== "resolvida" && n.state !== "arquivada").length,
    [rows],
  );

  const openNotification = async (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.event.startsWith("vacation_")) {
      nav({ to: "/app/ferias" });
    } else if (n.event.startsWith("expense_")) {
      nav({ to: "/app/despesas" });
    } else if (n.task_id) {
      nav({ to: "/app/tarefas", search: { task: n.task_id } });
    } else {
      nav({ to: "/app/tarefas" });
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
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? "default" : "outline"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">{counts[t.key] ?? 0}</span>
          </Button>
        ))}
      </div>

      {isLoading ? (
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
            const canManage = canManageNotification({
              currentCompanyId,
              isManager,
              isSuperAdmin,
              notificationCompanyId: n.company_id,
            });
            const isAuthReq = n.event === "task_authorization_requested" && canManage;
            const actions = resolveNotificationActions({
              canManage,
              canOpen:
                !!n.task_id || n.event.startsWith("vacation_") || n.event.startsWith("expense_"),
              state,
            });
            const refusal = taskRejectionNotificationDetails(n.event, n.metadata);
            const cancellation = taskCancellationNotificationDetails(n.event, n.metadata);
            return (
              <li
                key={n.id}
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
                          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                          STATE_TONE[state]
                        }
                      >
                        {STATE_LABEL[state]}
                        {state === "encaminhada" && n.forwarded_to ? ` · ${n.forwarded_to}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 font-medium">{n.title}</p>
                    {refusal ? (
                      <div className="mt-2 space-y-1 border-l-2 border-destructive/30 pl-3 text-sm">
                        <p className="text-muted-foreground">
                          {refusal.employeeName ? `${refusal.employeeName} recusou a tarefa.` : "Tarefa recusada pelo funcionário."}
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
                      </div>
                    ) : cancellation ? (
                      <div className="mt-2 space-y-1 border-l-2 border-destructive/30 pl-3 text-sm">
                        <p><span className="font-medium">Quem cancelou:</span>{" "}{cancellation.actorName}{cancellation.actorRole ? ` (${cancellation.actorRole})` : ""}</p>
                        {cancellation.taskTitle && <p><span className="font-medium">Tarefa:</span> {cancellation.taskTitle}</p>}
                        {cancellation.clientName && <p><span className="font-medium">Cliente:</span> {cancellation.clientName}</p>}
                        <p><span className="font-medium">Motivo:</span> {cancellation.reason ?? "Motivo não informado"}</p>
                        {cancellation.cancelledAt && <p className="text-xs text-muted-foreground">Cancelada em: {new Date(cancellation.cancelledAt).toLocaleString("pt-PT")}</p>}
                      </div>
                    ) : (
                      n.body && <p className="mt-0.5 break-words text-sm text-muted-foreground">{n.body}</p>
                    )}
                    {n.state_note && (
                      <p className="mt-1 text-xs italic text-muted-foreground">Nota: {n.state_note}</p>
                    )}
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

                  {actions.treat && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setState.isPending}
                      onClick={() => setState.mutate({ ids: [n.id], state: "em_tratamento" })}
                    >
                      <Timer className="mr-1.5 h-4 w-4" /> Tratar
                    </Button>
                  )}
                  {actions.forward && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setState.isPending}
                      onClick={() => openForward(n)}
                    >
                      <Send className="mr-1.5 h-4 w-4" /> Encaminhar
                    </Button>
                  )}
                  {actions.resolve && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setState.isPending}
                      onClick={() => setState.mutate({ ids: [n.id], state: "resolvida" })}
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
