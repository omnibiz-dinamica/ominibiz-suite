/**
 * OmniBiz · Visualizador de Folha de Ponto (ADR-038) — somente leitura.
 * Usado pelo Gestor e pelo Contabilista. Nunca altera ponto nem remuneração.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TimesheetCorrectionEditor } from "@/components/ponto/TimesheetCorrectionEditor";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Pencil, Printer } from "lucide-react";
import {
  TIMESHEET_STATUS_LABEL,
  buildSnapshot,
  formatMinutes,
  getVersion,
  logAccess,
  monthLabel,
  type TimesheetListRow,
} from "@/lib/timesheet";
import { timesheetRowToPdf } from "@/lib/timesheet-batch";
import { downloadBytes, printBytes } from "@/lib/timesheet-pdf";
import { isDayVisto, resolveVersionSignature, signatureNotice } from "@/lib/timesheet-signature";
import { withLiveExtras } from "@/lib/timesheet-view";
import { TimesheetDaysTable } from "@/components/ponto/TimesheetDaysTable";
import { toast } from "sonner";

export function TimesheetViewerDialog({
  row,
  companyId,
  year,
  month,
  onClose,
  canEdit = false,
  onChanged,
}: {
  row: TimesheetListRow | null;
  companyId: string;
  year: number;
  month: number;
  onClose: () => void;
  /** Gestor no Fechamento: pode corrigir horas/datas/cliente no próprio modal. */
  canEdit?: boolean;
  /** Depois de gravar uma correção (ex.: atualizar a lista). */
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Depois de uma correção numa folha assinada há uma versão nova: mostra essa.
  const [versionOverride, setVersionOverride] = useState<{
    period: string;
    version: number;
  } | null>(null);
  const currentVersion =
    row && versionOverride?.period === row.period_id
      ? versionOverride.version
      : (row?.current_version ?? 0);
  const viewRow = row ? { ...row, current_version: currentVersion } : null;

  const snap = useQuery({
    queryKey: ["timesheet-view", row?.period_id, currentVersion],
    enabled: !!row,
    queryFn: async () => {
      void logAccess(row!.period_id, "REPORT_VIEWED");
      if (currentVersion > 0) {
        const v = await getVersion(row!.period_id, currentVersion);
        if (v?.snapshot) {
          const sig = resolveVersionSignature(v, v.snapshot, {
            signedAt: v.signed_at ?? row!.signed_at,
          });
          const view = await withLiveExtras(v.snapshot);
          return {
            snapshot: view.snapshot,
            extrasLive: view.extrasLive,
            signatureUrl: sig.signatureUrl,
          };
        }
      }
      const snapshot = await buildSnapshot({
        companyId,
        employeeId: row!.employee_id,
        year,
        month,
      });
      return { snapshot, extrasLive: false, signatureUrl: null as string | null };
    },
  });

  const exportPdf = async (mode: "print" | "download") => {
    if (!row) return;
    try {
      const bytes = await timesheetRowToPdf(viewRow ?? row, { companyId, year, month });
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
    <Dialog
      open={!!row}
      onOpenChange={(v) => {
        if (!v) {
          setEditing(false);
          onClose();
        }
      }}
    >
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
              {(() => {
                const notice = signatureNotice({
                  signedAt: row?.signed_at,
                  snapshotSignatureUrl: snap.data.signatureUrl,
                });
                return notice ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {notice}
                  </div>
                ) : null;
              })()}
              {canEdit &&
                row &&
                (editing ? (
                  <TimesheetCorrectionEditor
                    periodId={row.period_id}
                    companyId={companyId}
                    employeeId={row.employee_id}
                    year={year}
                    month={month}
                    onCancel={() => setEditing(false)}
                    onSaved={(version) => {
                      if (version > 0) setVersionOverride({ period: row.period_id, version });
                      void snap.refetch();
                      onChanged?.();
                    }}
                  />
                ) : (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      <Pencil className="h-4 w-4" /> Corrigir pontos
                    </Button>
                  </div>
                ))}
              <TimesheetDaysTable
                snapshot={snap.data.snapshot}
                extrasLive={snap.data.extrasLive}
                renderVisto={(d) => (
                  <span className="text-xs text-muted-foreground">
                    {isDayVisto(d, { signedAt: row?.signed_at }) ? "confirmado" : "—"}
                  </span>
                )}
              />
              <div className="grid gap-2 rounded-xl border border-border bg-card/60 p-4 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Horas</div>
                  <div className="font-medium">
                    {formatMinutes(snap.data.snapshot.summary.worked_minutes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Dias</div>
                  <div className="font-medium">{snap.data.snapshot.summary.paid_days}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Tipo</div>
                  <div className="font-medium">
                    {snap.data.snapshot.summary.payment_type_used ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Total</div>
                  <div className="font-medium">
                    {snap.data.snapshot.summary.payment_type_used === "monthly"
                      ? (snap.data.snapshot.summary.monthly_amount ?? "—")
                      : (snap.data.snapshot.summary.calculated_amount ?? "—")}{" "}
                    {snap.data.snapshot.summary.currency}
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
