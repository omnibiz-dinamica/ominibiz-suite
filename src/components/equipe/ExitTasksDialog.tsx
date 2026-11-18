/**
 * SUP-308 (18/11/2026) — Tarefas depois da data de saída.
 *
 * O gestor vê as tarefas pendentes do funcionário depois da data de rescisão
 * e escolhe o que remover (decisão do Eduardo: mostrar a lista, não apagar
 * sozinho). Tarefas avulsas → task_soft_delete; séries → task_series_delete
 * "future" a partir da 1.ª data depois da saída (encerra a série nessa data;
 * o que já tem histórico é cancelado, nunca apagado — regra do backend).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX, Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { deleteTaskSeries } from "@/lib/tasks";

type Row = {
  id: string;
  title: string;
  scheduled_for: string | null;
  recurrence_date: string | null;
  recurrence_id: string | null;
};

export type ExitTaskGroup =
  | { kind: "single"; key: string; task: Row; date: string }
  | { kind: "series"; key: string; first: Row; count: number; title: string; from: string };

const dayOf = (r: Row) => (r.scheduled_for ?? r.recurrence_date ?? "").slice(0, 10);

/** Agrupa: tarefas avulsas uma a uma; séries numa linha (1.ª data + quantas). */
export function groupExitTasks(rows: Row[]): ExitTaskGroup[] {
  const singles: ExitTaskGroup[] = [];
  const series = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.recurrence_id) series.set(r.recurrence_id, [...(series.get(r.recurrence_id) ?? []), r]);
    else singles.push({ kind: "single", key: `t:${r.id}`, task: r, date: dayOf(r) });
  }
  const out: ExitTaskGroup[] = [...singles];
  for (const [rid, list] of series) {
    const sorted = [...list].sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
    out.push({
      kind: "series",
      key: `s:${rid}`,
      first: sorted[0],
      count: sorted.length,
      title: sorted[0].title,
      from: dayOf(sorted[0]),
    });
  }
  return out.sort((a, b) =>
    (a.kind === "single" ? a.date : a.from).localeCompare(b.kind === "single" ? b.date : b.from),
  );
}

const br = (iso: string) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";

export function ExitTasksDialog({
  open,
  onOpenChange,
  userId,
  companyId,
  terminationDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  companyId: string;
  terminationDate: string;
}) {
  const qc = useQueryClient();
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["exit-tasks", companyId, userId, terminationDate],
    enabled: open && !!terminationDate,
    queryFn: async () => {
      // Dia seguinte à saída (o próprio dia de saída ainda é de trabalho).
      const next = new Date(`${terminationDate}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const from = next.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, scheduled_for, recurrence_date, recurrence_id")
        .eq("company_id", companyId)
        .eq("assigned_to", userId)
        .is("deleted_at", null)
        .in("status", ["pendente", "autorizado"])
        .or(`scheduled_for.gte.${from},recurrence_date.gte.${from}`)
        .order("scheduled_for", { ascending: true })
        .range(0, 1999);
      if (error) throw error;
      return groupExitTasks((data ?? []) as Row[]);
    },
  });
  const groups = useMemo(() => q.data ?? [], [q.data]);
  const chosen = groups.filter((g) => !unchecked.has(g.key));

  const run = async () => {
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const g of chosen) {
      try {
        if (g.kind === "single") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase.rpc as any)("task_soft_delete", {
            _task_id: g.task.id,
          });
          if (error) throw error;
        } else {
          await deleteTaskSeries(g.first.id, "future", "Rescisão do funcionário");
        }
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["exit-tasks", companyId, userId] });
    if (failed)
      toast.error(`${ok} removida(s); ${failed} não foi possível remover (veja em Tarefas).`);
    else toast.success(`${ok} item(ns) removido(s) depois da saída.`);
    if (!failed) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent size="md">
        <ModalHeader
          icon={CalendarX}
          title="Tarefas depois da saída"
          description={`Tarefas pendentes depois de ${br(terminationDate)}. Escolha o que remover; nada é removido sem confirmar.`}
        />
        <ModalBody className="space-y-3" data-testid="exit-tasks-dialog">
          {q.isLoading && (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A procurar tarefas…
            </p>
          )}
          {q.isError && (
            <p className="text-sm text-destructive">Não foi possível carregar as tarefas.</p>
          )}
          {q.isSuccess && groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Não há tarefas pendentes depois da data de saída.
            </p>
          )}
          {groups.length > 0 && (
            <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {groups.map((g) => (
                <li key={g.key} className="flex items-start gap-3 p-3 text-sm">
                  <Checkbox
                    checked={!unchecked.has(g.key)}
                    onCheckedChange={(v) =>
                      setUnchecked((s) => {
                        const n = new Set(s);
                        if (v) n.delete(g.key);
                        else n.add(g.key);
                        return n;
                      })
                    }
                    aria-label="Remover"
                  />
                  {g.kind === "single" ? (
                    <div className="min-w-0">
                      <p className="break-words font-medium">{g.task.title}</p>
                      <p className="text-xs text-muted-foreground">{br(g.date)}</p>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 break-words font-medium">
                        <Repeat className="h-3.5 w-3.5 shrink-0" /> {g.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Série: {g.count} data(s) a partir de {br(g.from)} — termina a série nessa
                        data
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button disabled={busy || chosen.length === 0} onClick={() => void run()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Remover selecionadas ({chosen.length})
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
