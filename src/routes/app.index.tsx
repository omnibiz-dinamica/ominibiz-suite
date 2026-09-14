import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ClipboardList, CheckCircle2, Clock, AlertTriangle, Building2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeDashboard } from "@/components/dashboards/EmployeeDashboard";
import { SuperAdminDashboard } from "@/components/dashboards/SuperAdminDashboard";
import {
  classifyDashboardTask,
  countDashboardTasks,
  localDayKey,
  taskOperationalDay,
} from "@/lib/tasks/dashboard-counters";
import { sortTasksForList } from "@/lib/tasks/list-order";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { effectiveRole, currentCompanyId } = useAuth();
  if (effectiveRole === "super_admin" && !currentCompanyId) return <SuperAdminDashboard />;
  if (effectiveRole === "employee") return <EmployeeDashboard />;
  return <ManagerDashboard />;
}

/** O dia operacional é recalculado sozinho na viragem do dia. */
function useOperationalDay() {
  const [day, setDay] = useState(() => localDayKey());
  useEffect(() => {
    const id = setInterval(() => {
      setDay((current) => {
        const next = localDayKey();
        return next === current ? current : next;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return day;
}

function ManagerDashboard() {
  const { user, isManager, isSuperAdmin, currentCompanyId, initialized } = useAuth();
  const today = useOperationalDay();

  const {
    data: tasks,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    // A chave começa por "tasks" para que qualquer mutação de tarefa
    // (criar, concluir, cancelar, recusar, reatribuir) já invalide o Dashboard.
    queryKey: ["tasks", "dashboard", currentCompanyId, user?.id, isManager, today],
    queryFn: async () => {
      // O filtro do dia operacional é feito no banco: buscar tudo faria o
      // PostgREST truncar em 1000 linhas e esconder as tarefas de hoje.
      const start = `${today}T00:00:00.000`;
      const end = `${today}T23:59:59.999`;
      let q = supabase
        .from("tasks")
        .select(
          "id, status, scheduled_for, recurrence_date, due_at, started_at, archived_at, deleted_at, refused_by, title, client_id",
        )
        .is("deleted_at", null)
        .is("archived_at", null)
        .or(
          [
            `and(scheduled_for.gte.${start},scheduled_for.lte.${end})`,
            `and(scheduled_for.is.null,recurrence_date.eq.${today})`,
            `and(scheduled_for.is.null,recurrence_date.is.null,due_at.gte.${start},due_at.lte.${end})`,
          ].join(","),
        )
        .limit(2000);
      if (!isManager) q = q.eq("assigned_to", user!.id);
      else if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data, error: queryError } = await q;
      if (queryError) throw queryError;
      return data ?? [];
    },
    enabled: initialized && !!user && (!isManager || !!currentCompanyId || isSuperAdmin),
  });

  // Somente as tarefas cujo dia operacional é hoje. O histórico permanece no
  // banco e continua acessível em lista, calendário e relatórios.
  const todayTasks = useMemo(
    () => (tasks ?? []).filter((t) => taskOperationalDay(t) === today),
    [tasks, today],
  );
  const counts = useMemo(() => countDashboardTasks(todayTasks, { day: today }), [todayTasks, today]);

  const upcoming = useMemo(
    () =>
      sortTasksForList(
        todayTasks.filter((t) => {
          const bucket = classifyDashboardTask(t);
          return bucket === "pendente" || bucket === "em_andamento" || bucket === "atrasada";
        }),
      ).slice(0, 5),
    [todayTasks],
  );

  const cards = [
    { label: "Pendentes", value: counts.pendente, icon: ClipboardList, tone: "text-info", status: "pendente" as const },
    { label: "Em andamento", value: counts.em_andamento, icon: Clock, tone: "text-primary", status: "em_andamento" as const },
    { label: "Concluídas", value: counts.concluido, icon: CheckCircle2, tone: "text-success", status: "concluido" as const },
    { label: "Atrasadas", value: counts.atrasada, icon: AlertTriangle, tone: "text-destructive", status: "atrasadas" as const },
    { label: "Ausentes", value: counts.ausente, icon: UserX, tone: "text-warning", status: "ausente" as const },
    { label: "Canceladas/Recusadas", value: counts.cancelada + counts.recusada, icon: Ban, tone: "text-muted-foreground", status: "canceladas" as const },
  ];

  return (
    <div className="space-y-8">
      {isSuperAdmin && !currentCompanyId && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5 text-warning-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5" />
              <div>
                <div className="font-medium">Nenhuma empresa operacional selecionada</div>
                <div className="text-sm opacity-90">
                  Crie ou selecione uma empresa para liberar Usuários, Clientes, Tarefas e Folha de
                  Ponto.
                </div>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link to="/app/admin">Ir para Super Admin</Link>
            </Button>
          </div>
        </div>
      )}

      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Visão geral</h1>
        <p className="mt-1 text-muted-foreground">
          {isManager ? "Operação da sua empresa hoje" : "Suas tarefas de hoje"} ·{" "}
          {formatWallDate(`${today}T00:00:00.000Z`)}
        </p>
      </div>

      {isError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-destructive">
              Não foi possível carregar as tarefas de hoje. {(error as Error)?.message}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            to="/app/tarefas"
            search={{ status: c.status, date: today }}
            aria-label={`Ver tarefas de hoje — ${c.label}`}
            className="group rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className={`h-4 w-4 ${c.tone}`} />
            </div>
            {isLoading ? (
              <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
            ) : c.status === "canceladas" ? (
              <div className="mt-3 flex flex-wrap items-baseline gap-2 font-display text-2xl font-semibold group-hover:text-primary">
                <span>
                  {counts.cancelada} <span className="text-sm font-normal text-muted-foreground">Canceladas</span>
                </span>
                <span className="text-muted-foreground">|</span>
                <span>
                  {counts.recusada} <span className="text-sm font-normal text-muted-foreground">Recusadas</span>
                </span>
              </div>
            ) : (
              <div className="mt-3 font-display text-3xl font-semibold group-hover:text-primary">{c.value}</div>
            )}
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Tarefas de hoje</h2>
          <Button asChild size="sm" variant="ghost">
            <Link to="/app/tarefas">Ver todas</Link>
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {isLoading && (
            <li className="py-8 text-center text-sm text-muted-foreground">Carregando tarefas de hoje...</li>
          )}
          {!isLoading &&
            upcoming.map((t) => (
              <li key={t.id}>
                <Link
                  to="/app/tarefas"
                  search={{ task: t.id }}
                  className="flex items-center justify-between gap-3 py-3 transition hover:text-primary"
                >
                  <span className="min-w-0 truncate text-sm">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.scheduled_for ? formatWallTime(t.scheduled_for) : "Sem horário"}
                  </span>
                </Link>
              </li>
            ))}
          {!isLoading && !isError && upcoming.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma tarefa em aberto para hoje.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
