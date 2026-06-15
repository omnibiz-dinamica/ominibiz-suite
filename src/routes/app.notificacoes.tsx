import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bell, Check, CheckCheck, ExternalLink, ShieldCheck, X as XIcon } from "lucide-react";
import { transitionTask } from "@/lib/tasks";

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
  | "vacation_declined";

type NotificationPriority = "baixa" | "media" | "alta" | "urgente";

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
};

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
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as never)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as NotificationRow[];
    },
    enabled: !!user,
  });

  // Realtime: apenas invalida cache. Nenhuma regra aqui.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("notifications-ui-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const markRead = useMutation({
    mutationFn: async (id: string | null) => {
      const { error } = await supabase.rpc(
        "notification_mark_read" as never,
        (id ? { _id: id, _all: false } : { _all: true }) as never,
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "autorizar" | "cancelar" }) =>
      transitionTask(id, action),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(vars.action === "autorizar" ? "Tarefa autorizada" : "Solicitação rejeitada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unreadCount = useMemo(() => (data ?? []).filter((n) => !n.read_at).length, [data]);

  const openTask = async (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.event.startsWith("vacation_")) {
      nav({ to: "/app/ferias" });
    } else {
      nav({ to: "/app/tarefas" });
    }
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

      {isLoading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Sem notificações por enquanto</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Você será avisado quando uma tarefa exigir sua atenção.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {(data ?? []).map((n) => {
            const isAuthReq = n.event === "task_authorization_requested" && isManager;
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
                      <span className="text-xs text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 font-medium">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{n.body}</p>
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
                  {(n.task_id || n.event.startsWith("vacation_")) && (
                    <Button size="sm" variant="ghost" onClick={() => openTask(n)}>
                      <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir
                    </Button>
                  )}
                  {!n.read_at && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markRead.mutate(n.id)}
                      disabled={markRead.isPending}
                      aria-label="Marcar como lida"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
