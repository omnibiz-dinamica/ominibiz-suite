/**
 * OmniBiz · Contabilista — Folhas de Ponto liberadas (ADR-038).
 * Acesso somente leitura: apenas períodos com status `disponivel_contabilidade`
 * são visíveis (garantido pela RLS + RPC `timesheet_list`).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  MONTH_LABELS,
  TIMESHEET_STATUS_LABEL,
  formatMinutes,
  listPeriods,
  monthLabel,
  type TimesheetListRow,
} from "@/lib/timesheet";
import { buildTimesheetPackage } from "@/lib/timesheet-batch";
import { downloadBytes, printBytes } from "@/lib/timesheet-pdf";
import { TimesheetViewerDialog } from "@/components/ponto/TimesheetViewerDialog";

export const Route = createFileRoute("/app/contabilidade/folhas-ponto")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["accountant", "owner", "super_admin"]}>
      <AccountingTimesheets />
    </RoleGuard>
  );
}

function AccountingTimesheets() {
  const { currentCompanyId } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [viewing, setViewing] = useState<TimesheetListRow | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["timesheet-accounting", currentCompanyId, year, month],
    enabled: !!currentCompanyId,
    queryFn: () => listPeriods(currentCompanyId!, year, month),
  });

  const rows = useMemo(
    () => (list.data ?? []).filter((r) => r.status === "disponivel_contabilidade"),
    [list.data],
  );

  const exportPackage = async (mode: "print" | "download") => {
    if (rows.length === 0) {
      toast.error("Nenhuma folha liberada neste mês.");
      return;
    }
    setProgress(`0/${rows.length}`);
    try {
      const bytes = await buildTimesheetPackage(
        rows,
        { companyId: currentCompanyId!, year, month },
        (done, total) => setProgress(`${done}/${total}`),
      );
      if (mode === "print") printBytes(bytes);
      else downloadBytes(bytes, `folhas-ponto-contabilidade-${year}-${String(month).padStart(2, "0")}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const years = [now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Folhas de Ponto</h1>
        <p className="mt-1 text-muted-foreground">
          Documentos assinados e liberados pela gestão — {monthLabel(month, year)}.
        </p>
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
        <div className="flex items-end gap-2">
          <Button variant="outline" disabled={!!progress} onClick={() => exportPackage("download")}>
            <Download className="h-4 w-4" /> Baixar tudo
          </Button>
          <Button variant="ghost" disabled={!!progress} onClick={() => exportPackage("print")}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </div>
      </div>
      {progress && <div className="text-xs text-muted-foreground">Gerando {progress}...</div>}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Funcionário</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Horas</th>
              <th className="px-3 py-2 text-left">Dias</th>
              <th className="px-3 py-2 text-left">Versão</th>
              <th className="px-3 py-2 text-right">Documento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period_id} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.employee_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.job_title ?? r.employee_email}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{TIMESHEET_STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className="px-3 py-2">{formatMinutes(r.worked_minutes)}</td>
                <td className="px-3 py-2">{r.paid_days ?? 0}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">v{r.current_version}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setViewing(r)}>
                    Ver / Baixar
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-sm text-muted-foreground" colSpan={6}>
                  {list.isLoading ? "Carregando..." : "Nenhuma folha liberada neste mês."}
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
