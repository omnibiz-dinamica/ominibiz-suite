/**
 * OmniBiz · Impressão/download em lote de Folhas de Ponto (ADR-038).
 *
 * Sempre que existe PDF arquivado (versão assinada), é ESSE ficheiro que é
 * usado — o snapshot histórico nunca é regenerado. Só períodos sem versão
 * assinada produzem uma prévia gerada na hora.
 */
import {
  buildSnapshot,
  downloadTimesheetPdf,
  getVersion,
  logAccess,
  type TimesheetListRow,
} from "@/lib/timesheet";
import { generateTimesheetPdf, mergePdfs } from "@/lib/timesheet-pdf";

export async function timesheetRowToPdf(
  row: TimesheetListRow,
  ctx: { companyId: string; year: number; month: number },
): Promise<Uint8Array> {
  if (row.pdf_path) {
    const blob = await downloadTimesheetPdf(row.pdf_path);
    return new Uint8Array(await blob.arrayBuffer());
  }
  const snapshot =
    row.current_version > 0
      ? (await getVersion(row.period_id, row.current_version))?.snapshot ??
        (await buildSnapshot({
          companyId: ctx.companyId,
          employeeId: row.employee_id,
          year: ctx.year,
          month: ctx.month,
        }))
      : await buildSnapshot({
          companyId: ctx.companyId,
          employeeId: row.employee_id,
          year: ctx.year,
          month: ctx.month,
        });
  return generateTimesheetPdf(snapshot, {
    versionLabel: row.current_version > 0 ? `Versão ${row.current_version}` : "Prévia",
  });
}

export async function buildTimesheetPackage(
  rows: TimesheetListRow[],
  ctx: { companyId: string; year: number; month: number },
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const files: Uint8Array[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    try {
      files.push(await timesheetRowToPdf(rows[i], ctx));
      void logAccess(rows[i].period_id, "REPORT_DOWNLOADED");
    } catch {
      /* funcionário sem documento acessível é ignorado no pacote */
    }
    onProgress?.(i + 1, rows.length);
    // Devolve o controlo ao browser para não travar a interface.
    await new Promise((r) => setTimeout(r, 0));
  }
  if (files.length === 0) throw new Error("Nenhum relatório elegível para o pacote.");
  return mergePdfs(files);
}
