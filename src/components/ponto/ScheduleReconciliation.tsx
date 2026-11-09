/**
 * Conferência Previsto x Real (por funcionário e período).
 * Usada na Gestão do ponto e na folha do Fechamento / Contabilidade.
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Check, EyeOff, Pencil, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { formatCivilDate } from "@/lib/ponto/task-notes";
import {
  ACTION_LABEL,
  decideReconciliation,
  formatDiff,
  formatHours,
  ignoreConfirmText,
  listReconciliation,
  statusLabel,
  summarizeReconciliation,
  type ReconciliationDecision,
  type ReconciliationRow,
} from "@/lib/ponto/reconciliation";

export const RECONCILIATION_QUERY_KEY = "timesheet-reconciliation";

interface Props {
  companyId: string;
  employeeId: string | null;
  from: string;
  to: string;
  /** Validar / Ignorar / Desfazer (gestor e contabilidade). */
  canDecide?: boolean;
  /** Alterar o ponto (só gestor). Sem isto, o botão não aparece. */
  onEdit?: (row: ReconciliationRow) => void;
  /** Lançar ponto num dia sem ponto (só gestor). */
  onLaunch?: (row: ReconciliationRow) => void;
  /** Depois de uma decisão (ex.: recarregar a folha). */
  onChanged?: () => void;
}

function statusVariant(row: ReconciliationRow) {
  if (row.status === "pendente") return "destructive" as const;
  if (row.status === "aberto") return "outline" as const;
  if (row.status === "ok") return "secondary" as const;
  return "default" as const;
}

function diffClass(row: ReconciliationRow) {
  if (row.diff_minutes == null || row.diff_minutes === 0) return "text-muted-foreground";
  if (row.status !== "pendente") return "font-medium";
  return row.diff_minutes > 0 ? "font-semibold text-amber-700" : "font-semibold text-destructive";
}

export function ScheduleReconciliation({
  companyId,
  employeeId,
  from,
  to,
  canDecide = true,
  onEdit,
  onLaunch,
  onChanged,
}: Props) {
  const qc = useQueryClient();
  const [confirmIgnore, setConfirmIgnore] = useState<ReconciliationRow | null>(null);
  const [note, setNote] = useState("");

  const enabled = !!companyId && !!employeeId && !!from && !!to;
  const q = useQuery({
    queryKey: [RECONCILIATION_QUERY_KEY, companyId, employeeId, from, to],
    enabled,
    queryFn: () => listReconciliation({ companyId, employeeId: employeeId!, from, to }),
  });

  const decide = useMutation({
    mutationFn: (v: { row: ReconciliationRow; decision: ReconciliationDecision; notes?: string }) =>
      decideReconciliation({
        companyId,
        employeeId: employeeId!,
        row: v.row,
        decision: v.decision,
        notes: v.notes,
      }),
    onSuccess: (_d, v) => {
      toast.success(
        v.decision === "validated"
          ? "Validado: conta o real"
          : v.decision === "ignored"
            ? v.row.kind === "missing"
              ? "Falta marcada como vista (0h)"
              : "Ignorado: conta o previsto"
            : "Decisão desfeita",
      );
      qc.invalidateQueries({ queryKey: [RECONCILIATION_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ["timesheet-view"] });
      qc.invalidateQueries({ queryKey: ["timesheet-closing"] });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!employeeId) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Escolha um funcionário para ver a conferência previsto x real.
      </div>
    );
  }
  if (q.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Carregando conferência...
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <span>{(q.error as Error).message}</span>
        <Button size="sm" variant="outline" onClick={() => q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const rows = q.data ?? [];
  const s = summarizeReconciliation(rows);
  const busy = decide.isPending;

  const run = (row: ReconciliationRow, decision: ReconciliationDecision) =>
    decide.mutate({ row, decision });

  const actionButtons = (row: ReconciliationRow) => {
    const out: ReactNode[] = [];
    for (const a of row.actions) {
      if ((a === "validate" || a === "ignore" || a === "reset") && !canDecide) continue;
      if (a === "edit" && !onEdit) continue;
      if (a === "launch" && !onLaunch) continue;
      const Icon =
        a === "validate"
          ? Check
          : a === "ignore"
            ? EyeOff
            : a === "reset"
              ? Undo2
              : a === "launch"
                ? Plus
                : Pencil;
      out.push(
        <Button
          key={a}
          size="sm"
          variant={a === "validate" ? "default" : "outline"}
          disabled={busy}
          onClick={() => {
            if (a === "validate") run(row, "validated");
            else if (a === "reset") run(row, "reset");
            else if (a === "ignore") {
              setNote("");
              setConfirmIgnore(row);
            } else if (a === "edit") onEdit?.(row);
            else if (a === "launch") onLaunch?.(row);
          }}
        >
          <Icon className="mr-1 h-3.5 w-3.5" />
          {ACTION_LABEL[a]}
        </Button>,
      );
    }
    return out.length ? out : <span className="text-xs text-muted-foreground">—</span>;
  };

  const rowNote = (row: ReconciliationRow) => (
    <>
      {row.decision_stale && (
        <div className="mt-1 text-xs text-amber-700">
          O ponto mudou depois da decisão anterior: confira de novo.
        </div>
      )}
      {row.decided_by_name && row.status !== "pendente" && (
        <div className="mt-1 text-xs text-muted-foreground">
          {row.decided_by_name}
          {row.decided_at ? ` · ${new Date(row.decided_at).toLocaleString("pt-PT")}` : ""}
          {row.notes ? ` · ${row.notes}` : ""}
        </div>
      )}
      {row.period_locked && row.status === "pendente" && row.planned_minutes != null && (
        <div className="mt-1 text-xs text-muted-foreground">
          Folha assinada ou fechada: Ignorar só depois da correção da folha.
        </div>
      )}
    </>
  );

  const planned = (row: ReconciliationRow) =>
    row.planned_start ? `${row.planned_start}–${row.planned_end ?? "?"}` : "sem previsto";
  const real = (row: ReconciliationRow) =>
    row.entries_count === 0
      ? "sem ponto"
      : `${row.real_start ?? "?"}–${row.real_end ?? "em curso"}`;
  const what = (row: ReconciliationRow) =>
    row.client_name ?? row.task_title ?? (row.kind === "unplanned" ? "Ponto sem tarefa" : "Tarefa");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Previsto", value: formatHours(s.plannedMinutes) },
          { label: "Real", value: formatHours(s.realMinutes) },
          { label: "Saldo", value: formatDiff(s.balanceMinutes) },
          { label: "Conta na folha", value: formatHours(s.countedMinutes) },
          { label: "Por conferir", value: String(s.pending) },
          { label: "Dias sem ponto", value: String(s.missing) },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs uppercase text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-lg font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Sem tarefas nem pontos neste período.
        </div>
      ) : (
        <>
          {/* Computador */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Dia</th>
                  <th className="px-3 py-2 text-left">Cliente / tarefa</th>
                  <th className="px-3 py-2 text-left">Previsto</th>
                  <th className="px-3 py-2 text-left">Real</th>
                  <th className="px-3 py-2 text-right">Diferença</th>
                  <th className="px-3 py-2 text-right">Conta</th>
                  <th className="px-3 py-2 text-left">Situação</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.row_key} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatCivilDate(row.work_date)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{what(row)}</div>
                      {row.task_title && row.client_name && (
                        <div className="text-xs text-muted-foreground">{row.task_title}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {planned(row)}
                      {row.planned_minutes != null && (
                        <div className="text-xs text-muted-foreground">
                          {formatHours(row.planned_minutes)}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {real(row)}
                      {row.entries_count > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {formatHours(row.real_minutes)}
                        </div>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right ${diffClass(row)}`}>
                      {formatDiff(row.diff_minutes)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatHours(row.counted_minutes)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(row)}>{statusLabel(row)}</Badge>
                      {rowNote(row)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">{actionButtons(row)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Telemóvel */}
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <div
                key={row.row_key}
                className="rounded-xl border border-border bg-card p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {formatCivilDate(row.work_date)} · {what(row)}
                    </div>
                    {row.task_title && row.client_name && (
                      <div className="truncate text-xs text-muted-foreground">{row.task_title}</div>
                    )}
                  </div>
                  <Badge variant={statusVariant(row)} className="shrink-0">
                    {statusLabel(row)}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Previsto</span>
                  <span>{planned(row)}</span>
                  <span className="text-muted-foreground">Real</span>
                  <span>{real(row)}</span>
                  <span className="text-muted-foreground">Diferença</span>
                  <span className={diffClass(row)}>{formatDiff(row.diff_minutes)}</span>
                  <span className="text-muted-foreground">Conta na folha</span>
                  <span>{formatHours(row.counted_minutes)}</span>
                </div>
                {rowNote(row)}
                <div className="mt-2 flex flex-wrap gap-1">{actionButtons(row)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="flex items-start gap-1 text-xs text-muted-foreground">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Validar conta as horas reais. Ignorar conta as horas previstas (numa falta, só regista que
        foi vista e conta 0h). Duração igual à prevista não precisa de ação, mesmo com horário
        diferente.
      </p>

      <AlertDialog open={!!confirmIgnore} onOpenChange={(v) => !v && setConfirmIgnore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignorar a diferença?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmIgnore ? ignoreConfirmText(confirmIgnore) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observação (opcional)"
            aria-label="Observação"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmIgnore)
                  decide.mutate({ row: confirmIgnore, decision: "ignored", notes: note });
                setConfirmIgnore(null);
              }}
            >
              Ignorar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
