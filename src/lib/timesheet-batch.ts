/**
 * OmniBiz · Impressão/download em lote de Folhas de Ponto (ADR-038/ADR-059).
 *
 * O documento é SEMPRE renderizado a partir do snapshot imutável da versão
 * (fonte canónica) somado à assinatura associada a essa versão. O PDF
 * arquivado no bucket serve de fallback quando não há versão legível — assim
 * relatórios arquivados antes da correção da assinatura/visto passam a
 * apresentá-los sem alterar um único dado de ponto.
 */
import {
  buildSnapshot,
  downloadTimesheetPdf,
  getVersion,
  logAccess,
  type TimesheetListRow,
} from "@/lib/timesheet";
import { generateTimesheetPdf, mergePdfs } from "@/lib/timesheet-pdf";
import { resolveVersionSignature } from "@/lib/timesheet-signature";

export async function timesheetRowToPdf(
  row: TimesheetListRow,
  ctx: { companyId: string; year: number; month: number },
): Promise<Uint8Array> {
  const version = row.current_version > 0 ? await getVersion(row.period_id, row.current_version) : null;

  if (version?.snapshot) {
    const { signatureUrl } = resolveVersionSignature(version, version.snapshot, {
      signedAt: version.signed_at ?? row.signed_at,
    });
    return generateTimesheetPdf(version.snapshot, {
      versionLabel: `Versão ${version.version}`,
      signedAt: version.signed_at ?? row.signed_at,
      signatureUrl,
    });
  }

  if (row.pdf_path) {
    const blob = await downloadTimesheetPdf(row.pdf_path);
    return new Uint8Array(await blob.arrayBuffer());
  }

  const snapshot = await buildSnapshot({
    companyId: ctx.companyId,
    employeeId: row.employee_id,
    year: ctx.year,
    month: ctx.month,
  });
  return generateTimesheetPdf(snapshot, { versionLabel: "Prévia", signedAt: null });
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
