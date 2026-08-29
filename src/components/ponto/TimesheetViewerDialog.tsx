/**
 * OmniBiz · Visualizador de Folha de Ponto (ADR-038) — somente leitura.
 * Usado pelo Gestor e pelo Contabilista. Nunca altera ponto nem remuneração.
 */
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Printer } from "lucide-react";
import {
  TIMESHEET_STATUS_LABEL,
  buildSnapshot,
  formatDayTime,
  formatMinutes,
  getVersion,
  logAccess,
  monthLabel,
  type TimesheetListRow,
} from "@/lib/timesheet";
import { timesheetRowToPdf } from "@/lib/timesheet-batch";
import { downloadBytes, printBytes } from "@/lib/timesheet-pdf";
import { formatWallDate } from "@/lib/wall-clock";
import { toast } from "sonner";

export function TimesheetViewerDialog({
  row,
  companyId,
  year,
  month,
  onClose,
}: {
  row: TimesheetListRow | null;
  companyId: string;
  year: number;
  month: number;
  onClose: () => void;
}) {
  const snap = useQuery({
    queryKey: ["timesheet-view", row?.period_id, row?.current_version],
    enabled: !!row,
    queryFn: async () => {
      void logAccess(row!.period_id, "REPORT_VIEWED");
      if (row!.current_version > 0) {
        const v = await getVersion(row!.period_id, row!.current_version);
        if (v?.snapshot) return v.snapshot;
      }
      return buildSnapshot({ companyId, employeeId: row!.employee_id, year, month });
    },
  });

  const exportPdf = async (mode: "print" | "download") => {
    if (!row) return;
    try {
      const bytes = await timesheetRowToPdf(row, { companyId, year, month });
      void logAccess(row.period_id, "REPORT_DOWNLOADED");
      if (mode === "print") printBytes(bytes);
      else
        downloadBytes(
          bytes,
          `folha-ponto-${(row.employee_name ?? "funcionario").replace(/\s+/g, "-").toLowerCase()}-${year}-${String(month).padStart(2, "0")}.pdf`,
        );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl">
        <ModalHeader
          icon={FileText}
          title={row ? `${row.employee_name ?? "Funcionário"} · ${monthLabel(month, year)}` : ""}
          description={row ? TIMESHEET_STATUS_LABEL[row.status] : ""}
        />
        <ModalBody>
          {snap.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : snap.data ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Entrada</th>
                      <th className="px-3 py-2 text-left">Saída</th>
                      <th className="px-3 py-2 text-left">Pausas</th>
                      <th className="px-3 py-2 text-left">Total</th>
                      <th className="px-3 py-2 text-left">Situação</th>
                      <th className="px-3 py-2 text-left">Visto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.data.days.map((d) => (
                      <tr key={d.work_date} className="border-t border-border">
                        <td className="px-3 py-2">{formatWallDate(d.work_date) || d.work_date}</td>
                        <td className="px-3 py-2">{formatDayTime(d.first_in)}</td>
                        <td className="px-3 py-2">{formatDayTime(d.last_out)}</td>
                        <td className="px-3 py-2">{formatMinutes(d.break_minutes)}</td>
                        <td className="px-3 py-2">{formatMinutes(d.worked_minutes)}</td>
                        <td className="px-3 py-2">
                          {d.attendance_status === "absence" || d.attendance_status === "vacation_absence" ? (
                            <div className="space-y-1">
                              <Badge variant="destructive">FALTA</Badge>
                              <div className="text-xs text-muted-foreground">
                                {d.absence_task_count ?? 0} tarefa(s): {d.absence_tasks?.map((t) => t.title).join(", ")}
                              </div>
                              {d.attendance_status === "vacation_absence" && (
                                <div className="text-xs text-amber-700">Também há férias aprovadas</div>
                              )}
                            </div>
                          ) : d.attendance_status === "mixed" ? (
                            <div className="space-y-1">
                              <Badge variant="destructive">Trabalhado + falta</Badge>
                              <div className="text-xs text-muted-foreground">
                                {d.absence_task_count ?? 0} tarefa(s) sem realização
                              </div>
                            </div>
                          ) : d.day_type === "vacation" ? (
                            <div className="space-y-1">
                              <Badge variant="secondary">Férias</Badge>
                              {d.first_in && <div className="text-xs text-amber-700">Conflito com ponto</div>}
                            </div>
                          ) : (
                            "Trabalhado"
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {d.confirmed_at ? "confirmado" : "—"}
                        </td>
                      </tr>
                    ))}
                    {snap.data.days.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-sm text-muted-foreground" colSpan={7}>
                          Sem registos neste mês.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-2 rounded-xl border border-border bg-card/60 p-4 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Horas</div>
                  <div className="font-medium">{formatMinutes(snap.data.summary.worked_minutes)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Dias</div>
                  <div className="font-medium">{snap.data.summary.paid_days}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Tipo</div>
                  <div className="font-medium">{snap.data.summary.payment_type_used ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Total</div>
                  <div className="font-medium">
                    {snap.data.summary.payment_type_used === "monthly"
                      ? snap.data.summary.monthly_amount ?? "—"
                      : snap.data.summary.calculated_amount ?? "—"}{" "}
                    {snap.data.summary.currency}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-destructive">Não foi possível carregar o relatório.</div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => exportPdf("print")}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={() => exportPdf("download")}>
            <Download className="h-4 w-4" /> Baixar PDF
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
