/**
 * Fechamento mensal: Folha + Conferência Previsto x Real numa só tabela.
 * Mostra todos os dias do mês, mesmo sem tarefa nem ponto.
 *
 *  - Validar / Ignorar / Desfazer: gestor e contabilidade (verificado no banco).
 *  - Alterar / Lançar ponto / Adicionar ponto: só o gestor (canEdit) e só com a
 *    folha por assinar. Folha assinada: corrige-se em "Corrigir pontos" (nova versão).
 * O PDF e a vista do funcionário continuam com a TimesheetDaysTable.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Check, ClockPlus, EyeOff, Pencil, Plus, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { PunchEditorDrawer } from "@/components/ponto/PunchEditorDrawer";
import { RECONCILIATION_QUERY_KEY } from "@/components/ponto/ScheduleReconciliation";
import { formatCivilDate } from "@/lib/ponto/task-notes";
import { weekdayLetter, isWeekendKey } from "@/lib/timesheet-view";
import type { TimesheetSnapshot } from "@/lib/timesheet";
import type { AdminTimeEntry } from "@/lib/punch-admin";
import {
  ACTION_LABEL,
  decideReconciliation,
  formatDiff,
  formatHours,
  ignoreConfirmText,
  listReconciliation,
  monthRange,
  statusLabel,
  summarizeReconciliation,
  type ReconciliationAction,
  type ReconciliationDecision,
  type ReconciliationRow,
} from "@/lib/ponto/reconciliation";
import {
  addPointDefaults,
  buildClosingRows,
  launchDefaults,
  type ClosingRow,
} from "@/lib/ponto/closing-table";

interface Props {
  companyId: string;
  employeeId: string;
  employeeName: string | null;
  year: number;
  month: number;
  snapshot: TimesheetSnapshot | null | undefined;
  /** Gestor no Fechamento: Alterar / Lançar / Adicionar ponto. */
  canEdit: boolean;
  /** Folha assinada/fechada: sem ações de ponto por linha. */
  locked: boolean;
  onChanged?: () => void;
}

type EditorState =
  | { mode: "edit"; entry: AdminTimeEntry; taskTitle?: string; clientName?: string; date: string }
  | {
      mode: "create";
      date: string;
      taskId: string | null;
      taskTitle?: string;
      clientName?: string;
      startedAt: string | null;
      endedAt: string | null;
      regularize: boolean;
    };

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

const ICON: Record<ReconciliationAction, typeof Check> = {
  validate: Check,
  ignore: EyeOff,
  reset: Undo2,
  launch: Plus,
  edit: Pencil,
};

export function TimesheetClosingTable({
  companyId,
  employeeId,
  employeeName,
  year,
  month,
  snapshot,
  canEdit,
  locked,
  onChanged,
}: Props) {
  const qc = useQueryClient();
  const [confirmIgnore, setConfirmIgnore] = useState<ReconciliationRow | null>(null);
  const [note, setNote] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [opening, setOpening] = useState(false);
  const { from, to } = monthRange(year, month);
  const canPunch = canEdit && !locked;

  const q = useQuery({
    queryKey: [RECONCILIATION_QUERY_KEY, companyId, employeeId, from, to],
    enabled: !!companyId && !!employeeId,
    queryFn: () => listReconciliation({ companyId, employeeId, from, to }),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: [RECONCILIATION_QUERY_KEY] });
    qc.invalidateQueries({ queryKey: ["timesheet-view"] });
    qc.invalidateQueries({ queryKey: ["timesheet-closing"] });
    onChanged?.();
  };

  const decide = useMutation({
    mutationFn: (v: { row: ReconciliationRow; decision: ReconciliationDecision; notes?: string }) =>
      decideReconciliation({
        companyId,
        employeeId,
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
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(
    () => buildClosingRows(year, month, q.data ?? [], snapshot),
    [year, month, q.data, snapshot],
  );

  const openEdit = async (r: ReconciliationRow, date: string) => {
    if (!r.time_entry_id) return;
    setOpening(true);
    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .eq("id", r.time_entry_id)
      .maybeSingle();
    setOpening(false);
    if (error || !data) {
      toast.error(error?.message ?? "Ponto não encontrado");
      return;
    }
    setEditor({
      mode: "edit",
      entry: data as unknown as AdminTimeEntry,
      taskTitle: r.task_title ?? undefined,
      clientName: r.client_name ?? undefined,
      date,
    });
  };

  const openLaunch = (r: ReconciliationRow, date: string) => {
    if (!r.task_id) return;
    const d = launchDefaults(r.scheduled_for, r.scheduled_end);
    setEditor({
      mode: "create",
      date,
      taskId: r.task_id,
      taskTitle: r.task_title ?? undefined,
      clientName: r.client_name ?? undefined,
      startedAt: d.startedAt,
      endedAt: d.endedAt,
      regularize: true,
    });
  };

  const openAdd = (date: string) => {
    const d = addPointDefaults(date);
    setEditor({
      mode: "create",
      date,
      taskId: null,
      startedAt: d.startedAt,
      endedAt: d.endedAt,
      regularize: false,
    });
  };

  if (q.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Carregando folha e conferência...
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

  const s = summarizeReconciliation(q.data ?? []);
  const busy = decide.isPending || opening;

  const actionsFor = (row: ClosingRow): ReactNode => {
    const out: ReactNode[] = [];
    if (row.kind === "empty") {
      if (canPunch)
        out.push(
          <Button
            key="add"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => openAdd(row.date)}
          >
            <ClockPlus className="mr-1 h-3.5 w-3.5" />
            Adicionar ponto
          </Button>,
        );
    } else if (row.recon) {
      const r = row.recon;
      for (const a of r.actions) {
        if ((a === "edit" || a === "launch") && !canPunch) continue;
        const Icon = ICON[a];
        out.push(
          <Button
            key={a}
            size="sm"
            variant={a === "validate" ? "default" : "outline"}
            disabled={busy}
            onClick={() => {
              if (a === "validate") decide.mutate({ row: r, decision: "validated" });
              else if (a === "reset") decide.mutate({ row: r, decision: "reset" });
              else if (a === "ignore") {
                setNote("");
                setConfirmIgnore(r);
              } else if (a === "edit") void openEdit(r, row.date);
              else if (a === "launch") openLaunch(r, row.date);
            }}
          >
            <Icon className="mr-1 h-3.5 w-3.5" />
            {a === "edit" ? "Corrigir" : ACTION_LABEL[a]}
          </Button>,
        );
      }
    }
    return out.length ? out : <span className="text-xs text-muted-foreground">—</span>;
  };

  const cliente = (row: ClosingRow) => {
    if (row.kind === "empty") return <span className="text-muted-foreground">—</span>;
    if (row.kind === "vacation") return "Férias";
    if (row.kind === "paid_leave") return "Folga remunerada";
    const r = row.recon!;
    return (
      <>
        <div className="font-medium">
          {r.client_name ??
            r.task_title ??
            (r.kind === "unplanned" ? "Ponto sem tarefa" : "Tarefa")}
        </div>
        {r.task_title && r.client_name && (
          <div className="text-xs text-muted-foreground">{r.task_title}</div>
        )}
        {row.note && <div className="mt-0.5 text-xs italic text-muted-foreground">{row.note}</div>}
      </>
    );
  };

  const previsto = (row: ClosingRow) => {
    const r = row.recon;
    if (!r) return "—";
    return r.planned_start ? (
      <>
        {r.planned_start}–{r.planned_end ?? "?"}
        {r.planned_minutes != null && (
          <div className="text-xs text-muted-foreground">{formatHours(r.planned_minutes)}</div>
        )}
      </>
    ) : (
      <span className="text-xs text-muted-foreground">sem previsto</span>
    );
  };

  const entrada = (row: ClosingRow) =>
    row.recon && row.recon.entries_count > 0 ? (row.recon.real_start ?? "—") : "—";
  const saida = (row: ClosingRow) =>
    row.recon && row.recon.entries_count > 0 ? (row.recon.real_end ?? "em curso") : "—";
  const pausas = (row: ClosingRow) =>
    row.breakMinutes != null && row.breakMinutes > 0 ? formatHours(row.breakMinutes) : "—";
  const total = (row: ClosingRow) => {
    if (row.kind === "paid_leave" && row.entry)
      return formatHours(row.entry.worked_minutes ?? row.entry.effective_minutes);
    const r = row.recon;
    if (!r || r.entries_count === 0) return "—";
    return (
      <>
        {formatHours(r.real_minutes)}
        {r.counted_minutes !== r.real_minutes && (
          <div className="text-xs text-muted-foreground">
            conta {formatHours(r.counted_minutes)}
          </div>
        )}
      </>
    );
  };
  const diferenca = (row: ClosingRow) =>
    row.recon ? (
      <span className={diffClass(row.recon)}>{formatDiff(row.recon.diff_minutes)}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  const situacao = (row: ClosingRow) => {
    if (row.kind === "empty")
      return <span className="text-xs text-muted-foreground">Sem registo</span>;
    if (row.kind === "vacation") return <Badge variant="secondary">Férias</Badge>;
    if (row.kind === "paid_leave") return <Badge variant="secondary">Folga remunerada</Badge>;
    const r = row.recon!;
    return (
      <>
        <Badge variant={statusVariant(r)}>{statusLabel(r)}</Badge>
        {r.decision_stale && (
          <div className="mt-1 text-xs text-amber-700">
            O ponto mudou depois da decisão anterior: confira de novo.
          </div>
        )}
        {r.decided_by_name && r.status !== "pendente" && (
          <div className="mt-1 text-xs text-muted-foreground">
            {r.decided_by_name}
            {r.decided_at ? ` · ${new Date(r.decided_at).toLocaleString("pt-PT")}` : ""}
            {r.notes ? ` · ${r.notes}` : ""}
          </div>
        )}
      </>
    );
  };

  const dataCell = (row: ClosingRow) =>
    row.firstOfDay ? (
      <span className={isWeekendKey(row.date) ? "text-muted-foreground" : ""}>
        <span className="mr-1 inline-block w-3 font-semibold">{weekdayLetter(row.date)}</span>
        {formatCivilDate(row.date)}
      </span>
    ) : null;

  const drawerKey = editor
    ? `${editor.mode}:${editor.date}:${editor.mode === "edit" ? editor.entry.id : (editor.taskId ?? "novo")}`
    : "fechado";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Previsto", value: formatHours(s.plannedMinutes) },
          { label: "Real", value: formatHours(s.realMinutes) },
          { label: "Saldo", value: formatDiff(s.balanceMinutes) },
          { label: "Conta na folha", value: formatHours(s.countedMinutes) },
          { label: "Por conferir", value: String(s.pending) },
          { label: "Faltas por ver", value: String(s.missing) },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs uppercase text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-lg font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      {locked && canEdit && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Folha assinada ou fechada: para mudar pontos use "Corrigir pontos" (cria uma nova versão).
          Ignorar fica bloqueado até lá.
        </div>
      )}

      {/* Computador */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Previsto</th>
              <th className="px-3 py-2 text-left">Entrada</th>
              <th className="px-3 py-2 text-left">Saída</th>
              <th className="px-3 py-2 text-right">Pausas</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Diferença</th>
              <th className="px-3 py-2 text-left">Situação</th>
              <th className="px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={`align-top ${row.firstOfDay ? "border-t border-border" : ""} ${
                  row.kind === "empty" ? "bg-muted/20" : ""
                }`}
              >
                <td className="whitespace-nowrap px-3 py-2">{dataCell(row)}</td>
                <td className="px-3 py-2">{cliente(row)}</td>
                <td className="whitespace-nowrap px-3 py-2">{previsto(row)}</td>
                <td className="whitespace-nowrap px-3 py-2">{entrada(row)}</td>
                <td className="whitespace-nowrap px-3 py-2">{saida(row)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{pausas(row)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{total(row)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{diferenca(row)}</td>
                <td className="px-3 py-2">{situacao(row)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-1">{actionsFor(row)}</div>
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
            key={row.key}
            className={`rounded-xl border border-border p-3 text-sm ${
              row.kind === "empty" ? "bg-muted/20" : "bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  {weekdayLetter(row.date)} · {formatCivilDate(row.date)}
                </div>
                <div className="mt-0.5">{cliente(row)}</div>
              </div>
              <div className="shrink-0 text-right">{situacao(row)}</div>
            </div>
            {row.kind !== "empty" && row.kind !== "vacation" && (
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Previsto</span>
                <span>{previsto(row)}</span>
                <span className="text-muted-foreground">Entrada / Saída</span>
                <span>
                  {entrada(row)} – {saida(row)}
                </span>
                <span className="text-muted-foreground">Pausas</span>
                <span>{pausas(row)}</span>
                <span className="text-muted-foreground">Total</span>
                <span>{total(row)}</span>
                <span className="text-muted-foreground">Diferença</span>
                <span>{diferenca(row)}</span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1">{actionsFor(row)}</div>
          </div>
        ))}
      </div>

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

      {canPunch && editor && (
        <PunchEditorDrawer
          key={drawerKey}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditor(null);
              refreshAll();
            }
          }}
          mode={editor.mode}
          companyId={companyId}
          entry={editor.mode === "edit" ? editor.entry : null}
          entryTaskTitle={editor.taskTitle}
          entryUserName={employeeName ?? undefined}
          entryClientName={editor.clientName}
          initialEntryKind="work"
          initialUserId={employeeId}
          initialTaskId={editor.mode === "create" ? editor.taskId : null}
          initialStartedAt={editor.mode === "create" ? editor.startedAt : null}
          initialEndedAt={editor.mode === "create" ? editor.endedAt : null}
          regularizeTaskAbsence={editor.mode === "create" && editor.regularize}
        />
      )}
    </div>
  );
}
