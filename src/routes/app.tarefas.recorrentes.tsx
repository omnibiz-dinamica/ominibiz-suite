import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Pause, Play, Square, RefreshCcw, Pencil } from "lucide-react";
import {
  WEEKDAY_FULL,
  WEEKDAY_LABELS,
  monthPositionLabel,
  recurrenceEnd,
  recurrenceFrequencyLabel,
  recurrenceMaterialize,
  type RecurrenceRow,
} from "@/lib/tasks";
import { EditRecurrenceDialog } from "@/components/tasks/EditRecurrenceDialog";

export const Route = createFileRoute("/app/tarefas/recorrentes")({ component: RecurrencesPage });

function RecurrencesPage() {
  const { isManager, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RecurrenceRow | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ["recurrences", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("task_recurrences" as any) as any)
        .select("*")
        .eq("company_id", currentCompanyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecurrenceRow[];
    },
    enabled: isManager && !!currentCompanyId,
  });

  const { data: members } = useQuery({
    queryKey: ["members", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", currentCompanyId);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return profs ?? [];
    },
    enabled: isManager && !!currentCompanyId,
  });

  const end = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => recurrenceEnd(id, reason, true),
    onSuccess: () => {
      toast.success("Recorrência encerrada");
      qc.invalidateQueries({ queryKey: ["recurrences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pauseToggle = useMutation({
    mutationFn: async (r: RecurrenceRow) => {
      const next = r.status === "paused" ? "active" : "paused";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("task_recurrences" as any) as any)
        .update({ status: next })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurrences"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const materialize = async () => {
    setBusy(true);
    try {
      const n = await recurrenceMaterialize(60, currentCompanyId);
      toast.success(`${n} ocorrência(s) geradas`);
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isManager) {
    return <div className="p-6 text-sm text-muted-foreground">Apenas gestores podem ver recorrências.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button asChild size="sm" variant="ghost" className="-ml-2 mb-1">
            <Link to="/app/tarefas"><ArrowLeft className="mr-1 h-4 w-4" /> Tarefas</Link>
          </Button>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Recorrências</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Geração automática de ocorrências para clientes e serviços contínuos.
          </p>
        </div>
        <Button onClick={materialize} disabled={busy} variant="outline">
          <RefreshCcw className="mr-2 h-4 w-4" /> {busy ? "Gerando..." : "Gerar próximas 60d"}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>}
        {!isLoading && (list ?? []).length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhuma recorrência. Crie uma tarefa e ative recorrência no formulário.
          </div>
        )}
        <ul className="divide-y divide-border">
          {(list ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      r.status === "active"
                        ? "bg-success/15 text-success"
                        : r.status === "paused"
                        ? "bg-warning/15 text-warning-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {recurrenceFrequencyLabel(r.frequency, r.interval_weeks, r.monthly_rule)}
                  {r.frequency === "weekly" && r.weekdays.length > 0 && (
                    <> · {r.weekdays.map((d) => WEEKDAY_LABELS[d]).join("")}</>
                  )}
                  {r.frequency === "monthly" && r.monthly_rule?.position != null && r.monthly_rule?.weekday != null && (
                    <>
                      {" · "}
                      {monthPositionLabel(r.monthly_rule.position)} {WEEKDAY_FULL[r.monthly_rule.weekday]}
                    </>
                  )}
                  {r.frequency === "monthly" && r.monthly_rule?.position == null && r.monthly_rule?.day_of_month && (
                    <> · dia {r.monthly_rule.day_of_month}</>
                  )}
                  {" · "}
                  {r.scheduled_time?.slice(0, 5)} · início {new Date(r.start_date).toLocaleDateString()}
                  {r.end_date && <> · fim {new Date(r.end_date).toLocaleDateString()}</>}
                </div>
              </div>
              <div className="flex gap-2">
                {r.status !== "ended" && (
                  <Button size="sm" variant="outline" title="Editar" onClick={() => setEditing(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {r.status !== "ended" && (
                  <Button size="sm" variant="outline" onClick={() => pauseToggle.mutate(r)}>
                    {r.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  </Button>
                )}
                {r.status !== "ended" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const reason = window.prompt("Motivo do encerramento", "manual");
                      if (reason) end.mutate({ id: r.id, reason });
                    }}
                  >
                    <Square className="mr-1 h-3.5 w-3.5" /> Encerrar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <EditRecurrenceDialog
        recurrence={editing}
        members={members ?? []}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["recurrences"] });
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />
    </div>
  );
}