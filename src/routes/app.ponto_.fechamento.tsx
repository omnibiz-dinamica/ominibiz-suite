/**
 * OmniBiz · Gestor — Fechamento Mensal da Folha de Ponto (ADR-038).
 *
 * O gestor abre o mês, acompanha assinaturas, confere, fecha e libera para a
 * contabilidade. Fechar NÃO recalcula remuneração: usa a versão assinada.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarPlus, Download, Lock, Printer, Send } from "lucide-react";
import {
  MONTH_LABELS,
  TIMESHEET_STATUS_LABEL,
  closePeriod,
  formatMinutes,
  listPeriods,
  monthLabel,
  openMonth,
  sendToAccounting,
  type TimesheetListRow,
  type TimesheetStatus,
} from "@/lib/timesheet";
import { buildTimesheetPackage } from "@/lib/timesheet-batch";
import { downloadBytes, printBytes } from "@/lib/timesheet-pdf";
import { TimesheetViewerDialog } from "@/components/ponto/TimesheetViewerDialog";

export const Route = createFileRoute("/app/ponto_/fechamento")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["manager", "owner", "super_admin"]}>
      <Closing />
    </RoleGuard>
  );
}

function statusTone(status: TimesheetStatus) {
  if (status === "disponivel_contabilidade") return "secondary" as const;
  if (status === "aguardando_correcao") return "destructive" as const;
  if (status === "assinado_funcionario" || status === "fechado_gestor") return "default" as const;
  return "outline" as const;
}

function Closing() {
  const { currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [status, setStatus] = useState<TimesheetStatus | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [viewing, setViewing] = useState<TimesheetListRow | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const key = ["timesheet-closing", currentCompanyId, year, month] as const;
  const list = useQuery({
    queryKey: key,
    enabled: !!currentCompanyId,
    queryFn: () => listPeriods(currentCompanyId!, year, month),
  });

  const rows = useMemo(
    () => (list.data ?? []).filter((r) => status === "all" || r.status === status),
    [list.data, status],
  );
  const selectedRows = rows.filter((r) => selected.includes(r.period_id));

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const open = useMutation({
    mutationFn: () => openMonth(currentCompanyId!, year, month),
    onSuccess: (n) => {
      toast.success(`${n ?? 0} funcionário(s) notificados para conferência.`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runBatch = async (
    label: string,
    fn: (row: TimesheetListRow) => Promise<unknown>,
    targets = selectedRows,
  ) => {
    if (targets.length === 0) {
      toast.error("Selecione ao menos um funcionário.");
      return;
    }
    let ok = 0;
    const errors: string[] = [];
    for (const row of targets) {
      try {
        await fn(row);
        ok += 1;
      } catch (e) {
        errors.push(`${row.employee_name ?? row.employee_id}: ${(e as Error).message}`);
      }
    }
    invalidate();
    setSelected([]);
    if (ok > 0) toast.success(`${label}: ${ok} concluído(s).`);
    if (errors.length > 0) toast.error(errors.slice(0, 3).join(" · "));
  };

  const exportPackage = async (mode: "print" | "download") => {
    const targets = selectedRows.length > 0 ? selectedRows : rows;
    if (targets.length === 0) {
      toast.error("Nada para exportar.");
      return;
    }
    setProgress(`0/${targets.length}`);
    try {
      const bytes = await buildTimesheetPackage(
        targets,
        { companyId: currentCompanyId!, year, month },
        (done, total) => setProgress(`${done}/${total}`),
      );
      if (mode === "print") printBytes(bytes);
      else downloadBytes(bytes, `folhas-ponto-${year}-${String(month).padStart(2, "0")}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const years = [now.getUTCFullYear() + 1, now.getUTCFullYear(), now.getUTCFullYear() - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Fechamento Mensal</h1>
          <p className="mt-1 text-muted-foreground">
            Conferência, fechamento e liberação das folhas de ponto de {monthLabel(month, year)}.
          </p>
        </div>
        <Button onClick={() => open.mutate()} disabled={open.isPending || !currentCompanyId}>
          <CalendarPlus className="h-4 w-4" />
          {open.isPending ? "Abrindo..." : "Abrir mês para conferência"}
        </Button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Ano</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Mês</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, i) => (
                <SelectItem key={label} value={String(i + 1)}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as TimesheetStatus | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(TIMESHEET_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4">
        <span className="text-sm text-muted-foreground">
          {selectedRows.length > 0 ? `${selectedRows.length} selecionado(s)` : "Ações em lote"}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runBatch("Fechado", (r) => closePeriod(r.period_id))}
        >
          <Lock className="h-4 w-4" /> Fechar selecionados
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runBatch("Liberado", (r) => sendToAccounting(r.period_id))}
        >
          <Send className="h-4 w-4" /> Enviar à contabilidade
        </Button>
        <Button size="sm" variant="ghost" disabled={!!progress} onClick={() => exportPackage("print")}>
          <Printer className="h-4 w-4" /> Imprimir lote
        </Button>
        <Button size="sm" variant="ghost" disabled={!!progress} onClick={() => exportPackage("download")}>
          <Download className="h-4 w-4" /> Baixar lote
        </Button>
        {progress && <span className="text-xs text-muted-foreground">Gerando {progress}...</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">
                <Checkbox
                  checked={rows.length > 0 && selected.length === rows.length}
                  onCheckedChange={(v) =>
                    setSelected(v ? rows.map((r) => r.period_id) : [])
                  }
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="px-3 py-2 text-left">Funcionário</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Horas</th>
              <th className="px-3 py-2 text-left">Dias</th>
              <th className="px-3 py-2 text-left">Assinatura</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period_id} className="border-t border-border">
                <td className="px-3 py-2">
                  <Checkbox
                    checked={selected.includes(r.period_id)}
                    onCheckedChange={(v) =>
                      setSelected((prev) =>
                        v ? [...prev, r.period_id] : prev.filter((id) => id !== r.period_id),
                      )
                    }
                    aria-label={`Selecionar ${r.employee_name ?? ""}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.employee_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.job_title ?? r.employee_email}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={statusTone(r.status)}>{TIMESHEET_STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className="px-3 py-2">{formatMinutes(r.worked_minutes)}</td>
                <td className="px-3 py-2">{r.paid_days ?? 0}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.signed_at ? `v${r.current_version}` : r.has_signature ? "pendente" : "sem assinatura"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setViewing(r)}>
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runBatch("Fechado", (x) => closePeriod(x.period_id), [r])}
                    >
                      Fechar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => runBatch("Liberado", (x) => sendToAccounting(x.period_id), [r])}
                    >
                      Liberar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-sm text-muted-foreground" colSpan={7}>
                  {list.isLoading ? "Carregando..." : "Nenhuma folha neste mês/filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TimesheetViewerDialog
        row={viewing}
        companyId={currentCompanyId ?? ""}
        year={year}
        month={month}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
