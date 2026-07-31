import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Clock, ListChecks, Play } from "lucide-react";
import type { TaskRow } from "@/lib/tasks";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/tasks";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";

export function EmployeeDashboard() {
  const { user, profile } = useAuth();

  const { data: tasks } = useQuery({
    queryKey: ["employee-dashboard-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", user!.id)
        .in("status", ["pendente", "autorizado", "em_andamento"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
    enabled: !!user,
  });

  const inProgress = tasks?.filter((t) => t.status === "em_andamento").length ?? 0;
  const pending = tasks?.filter((t) => t.status !== "em_andamento").length ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Olá, {profile?.full_name ?? "colaborador"}
        </h1>
        <p className="mt-1 text-muted-foreground">Sua operação do dia. Bata o ponto e foque nas suas tarefas.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild size="lg" className="h-20 justify-start text-left">
          <Link to="/app/ponto">
            <Clock className="mr-3 h-6 w-6" />
            <div className="flex flex-col">
              <span className="font-display text-base font-semibold">Folha de Ponto</span>
              <span className="text-xs opacity-80">Iniciar, pausar e concluir</span>
            </div>
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-20 justify-start text-left">
          <Link to="/app/tarefas">
            <ListChecks className="mr-3 h-6 w-6" />
            <div className="flex flex-col">
              <span className="font-display text-base font-semibold">Minhas Tarefas</span>
              <span className="text-xs opacity-80">
                {inProgress} em andamento · {pending} a iniciar
              </span>
            </div>
          </Link>
        </Button>
      </div>

      <section className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3 text-sm font-medium">Próximas tarefas</div>
        {(tasks ?? []).length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Você não tem tarefas pendentes. Aproveite!
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(tasks ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.scheduled_for
                      ? `${formatWallDate(t.scheduled_for)} · ${formatWallTime(t.scheduled_for)}`
                      : t.recurrence_date || t.due_at
                        ? `${formatWallDate(t.recurrence_date ?? t.due_at)} · Sem horario definido`
                        : "Sem horário definido"}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[t.status]}`}>
                  {STATUS_LABELS[t.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border px-5 py-3 text-right">
          <Button asChild size="sm" variant="ghost">
            <Link to="/app/ponto">
              <Play className="mr-1 h-3 w-3" /> Ir para a operação
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
