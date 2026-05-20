import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, ClipboardList, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SuperAdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["super-admin-stats"],
    queryFn: async () => {
      const [companies, users, tasks] = await Promise.all([
        supabase.from("companies").select("id, status", { count: "exact", head: false }),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }),
        supabase.from("tasks").select("id, status", { count: "exact", head: false }),
      ]);
      const cmps = companies.data ?? [];
      const tks = tasks.data ?? [];
      return {
        companiesTotal: cmps.length,
        companiesActive: cmps.filter((c) => c.status === "active").length,
        usersTotal: users.count ?? 0,
        tasksTotal: tks.length,
        tasksOpen: tks.filter(
          (t) => t.status === "pendente" || t.status === "em_andamento" || t.status === "autorizado",
        ).length,
      };
    },
  });

  const cards = [
    {
      label: "Empresas",
      value: stats?.companiesTotal ?? 0,
      sub: `${stats?.companiesActive ?? 0} ativas`,
      icon: Building2,
    },
    { label: "Usuários", value: stats?.usersTotal ?? 0, sub: "no SaaS", icon: Users },
    {
      label: "Tarefas",
      value: stats?.tasksTotal ?? 0,
      sub: `${stats?.tasksOpen ?? 0} em aberto`,
      icon: ClipboardList,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
            <Shield className="h-3 w-3" /> Super Admin
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Dashboard Global
          </h1>
          <p className="mt-1 text-muted-foreground">
            Visão SaaS de todas as empresas, usuários e operação agregada.
          </p>
        </div>
        <Button asChild>
          <Link to="/app/admin">
            <Building2 className="mr-2 h-4 w-4" /> Gerenciar empresas
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 font-display text-3xl font-semibold">{c.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Como super admin</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>· Você cria, edita e gerencia empresas globalmente.</li>
          <li>
            · A operação do dia a dia (tarefas, ponto, equipe) é responsabilidade dos gestores
            de cada empresa.
          </li>
          <li>
            · Para auditar uma empresa específica, selecione-a em <strong>Empresas</strong>.
          </li>
        </ul>
      </div>
    </div>
  );
}