import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ClipboardList, CheckCircle2, Clock, AlertTriangle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeDashboard } from "@/components/dashboards/EmployeeDashboard";
import { SuperAdminDashboard } from "@/components/dashboards/SuperAdminDashboard";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { effectiveRole, currentCompanyId } = useAuth();
  if (effectiveRole === "super_admin" && !currentCompanyId) return <SuperAdminDashboard />;
  if (effectiveRole === "employee") return <EmployeeDashboard />;
  return <ManagerDashboard />;
}

function ManagerDashboard() {
  const { user, isManager, isSuperAdmin, currentCompanyId, initialized } = useAuth();

  const { data: tasks } = useQuery({
    queryKey: ["dashboard-tasks", currentCompanyId, user?.id, isManager],
    queryFn: async () => {
      let q = supabase.from("tasks").select("id, status, due_at, title");
      if (!isManager) q = q.eq("assigned_to", user!.id);
      else if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: initialized && !!user && (!isManager || !!currentCompanyId || isSuperAdmin),
  });

  const counts = {
    pendente: tasks?.filter((t) => t.status === "pendente").length ?? 0,
    em_andamento: tasks?.filter((t) => t.status === "em_andamento").length ?? 0,
    concluido: tasks?.filter((t) => t.status === "concluido").length ?? 0,
    atrasadas:
      tasks?.filter((t) => t.due_at && new Date(t.due_at) < new Date() && t.status !== "concluido")
        .length ?? 0,
  };

  const cards = [
    { label: "Pendentes", value: counts.pendente, icon: ClipboardList, tone: "text-info", to: "/app/tarefas" as const },
    { label: "Em andamento", value: counts.em_andamento, icon: Clock, tone: "text-primary", to: "/app/tarefas" as const },
    { label: "Concluídas", value: counts.concluido, icon: CheckCircle2, tone: "text-success", to: "/app/tarefas" as const },
    { label: "Atrasadas", value: counts.atrasadas, icon: AlertTriangle, tone: "text-destructive", to: "/app/tarefas" as const },
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
          {isManager ? "Operação da sua empresa em tempo real." : "Suas tarefas e entregas."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            aria-label={`Ver tarefas — ${c.label}`}
            className="group rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className={`h-4 w-4 ${c.tone}`} />
            </div>
            <div className="mt-3 font-display text-3xl font-semibold group-hover:text-primary">{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Próximas tarefas</h2>
          <Button asChild size="sm" variant="ghost"><Link to="/app/tarefas">Ver todas</Link></Button>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {(tasks ?? []).slice(0, 5).map((t) => (
            <li key={t.id}>
              <Link
                to="/app/tarefas"
                className="flex items-center justify-between py-3 transition hover:text-primary"
              >
                <span className="text-sm">{t.title}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t.status}
                </span>
              </Link>
            </li>
          ))}
          {(!tasks || tasks.length === 0) && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma tarefa ainda.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
