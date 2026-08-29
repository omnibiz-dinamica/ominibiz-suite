import jsPDF from "jspdf";
import { PDFDocument } from "pdf-lib";
import {
  MONTH_LABELS,
  formatDayTime,
  formatMinutes,
  monthLabel,
  signatureDataUrl,
  type TimesheetSnapshot,
} from "@/lib/timesheet";
import { formatWallDate } from "@/lib/wall-clock";
import { PAYMENT_TYPE_LABEL, type PaymentType } from "@/lib/compensation";

/**
 * Gerador do PDF "Folha de Ponto Individual de Trabalho" (ADR-038).
 *
 * Consome EXCLUSIVAMENTE o snapshot gravado no fechamento. Nenhum cálculo
 * financeiro acontece aqui — os valores chegam prontos da fonte canónica.
 */

const MARGIN = 40;
const A4 = { w: 595.28, h: 841.89 };

function money(value: number | null | undefined, currency: string) {
  if (value == null) return "—";
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${Number(value).toFixed(2)}`;
}

function payLabel(type: string | null | undefined) {
  if (!type) return "—";
  return PAYMENT_TYPE_LABEL[type as PaymentType] ?? type;
}

export async function generateTimesheetPdf(
  snapshot: TimesheetSnapshot,
  opts: { versionLabel?: string; embedSignatures?: boolean } = {},
): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const contentW = A4.w - MARGIN * 2;
  let y = MARGIN;
  let page = 1;

  const sigData = opts.embedSignatures === false ? null : await signatureDataUrl(snapshot.employee.signature_url);
  const initialsData =
    opts.embedSignatures === false ? null : await signatureDataUrl(snapshot.employee.initials_url);

  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text((snapshot.company.name ?? "OmniBiz").toUpperCase(), MARGIN, y);
    doc.text("OmniBiz Suite", A4.w - MARGIN, y, { align: "right" });
    y += 6;
    doc.setDrawColor(210);
    doc.line(MARGIN, y, A4.w - MARGIN, y);
    y += 22;

    doc.setTextColor(20);
    doc.setFontSize(15);
    doc.text("FOLHA DE PONTO INDIVIDUAL DE TRABALHO", MARGIN, y);
    y += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const rows: [string, string][] = [
      ["Nome do empregado", snapshot.employee.full_name ?? "—"],
      ["Função", snapshot.employee.job_title ?? "—"],
      ["Local de trabalho", snapshot.employee.work_location ?? "—"],
      ["Mês / Ano", `${MONTH_LABELS[snapshot.period.month - 1]} / ${snapshot.period.year}`],
    ];
    for (const [k, v] of rows) {
      doc.setTextColor(120);
      doc.text(`${k}:`, MARGIN, y);
      doc.setTextColor(20);
      doc.text(String(v), MARGIN + 120, y);
      y += 14;
    }
    y += 8;
  };

  const cols = [
    { key: "date", label: "Data", w: 70 },
    { key: "in", label: "Entrada", w: 70 },
    { key: "out", label: "Saída", w: 70 },
    { key: "break", label: "Pausas", w: 70 },
    { key: "total", label: "Total horas", w: 90 },
    { key: "status", label: "Situação", w: 85 },
    { key: "visto", label: "Visto", w: contentW - 455 },
  ];

  const tableHead = () => {
    doc.setFillColor(243, 244, 246);
    doc.rect(MARGIN, y - 11, contentW, 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60);
    let x = MARGIN + 6;
    for (const c of cols) {
      doc.text(c.label, x, y + 2);
      x += c.w;
    }
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(25);
  };

  const newPage = (continuation: boolean) => {
    doc.addPage();
    page += 1;
    y = MARGIN;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      `${(snapshot.company.name ?? "OmniBiz").toUpperCase()} — Folha de Ponto ${monthLabel(
        snapshot.period.month,
        snapshot.period.year,
      )}${continuation ? " (continuação)" : ""}`,
      MARGIN,
      y,
    );
    y += 6;
    doc.line(MARGIN, y, A4.w - MARGIN, y);
    y += 24;
    doc.setTextColor(25);
    tableHead();
  };

  header();
  tableHead();

  doc.setFontSize(9);
  for (const d of snapshot.days) {
    if (y > A4.h - 120) newPage(true);
    let x = MARGIN + 6;
    const cells = [
      formatWallDate(d.work_date) || d.work_date,
      formatDayTime(d.first_in),
      formatDayTime(d.last_out),
      formatMinutes(d.break_minutes),
      formatMinutes(d.worked_minutes),
      d.attendance_status === "absence" || d.attendance_status === "vacation_absence"
        ? `Falta (${d.absence_task_count ?? 0} tarefa(s))`
        : d.attendance_status === "mixed"
          ? `Trabalhado + falta (${d.absence_task_count ?? 0})`
          : d.day_type === "vacation"
            ? d.first_in
              ? "Férias + ponto"
              : "Férias"
            : "Trabalhado",
      "",
    ];
    cells.forEach((value, i) => {
      if (i === 6) {
        // Coluna Visto: só usa a rubrica quando o dia foi realmente confirmado.
        if (d.confirmed_at && initialsData) {
          try {
            doc.addImage(initialsData, "PNG", x, y - 9, 46, 14);
          } catch {
            doc.text("✓", x, y + 1);
          }
        } else if (d.confirmed_at) {
          doc.text("✓", x, y + 1);
        }
      } else {
        doc.text(String(value), x, y + 1);
      }
      x += cols[i].w;
    });
    doc.setDrawColor(232);
    doc.line(MARGIN, y + 6, A4.w - MARGIN, y + 6);
    y += 18;
  }

  if (snapshot.days.length === 0) {
    doc.setTextColor(130);
    doc.text("Sem registos de ponto neste mês.", MARGIN + 6, y + 1);
    doc.setTextColor(25);
    y += 20;
  }

  // ---------- Resumo do mês ----------
  if (y > A4.h - 240) newPage(true);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RESUMO DO MÊS", MARGIN, y);
  y += 6;
  doc.setDrawColor(210);
  doc.line(MARGIN, y, A4.w - MARGIN, y);
  y += 18;

  const s = snapshot.summary;
  const type = s.payment_type_used as PaymentType | null;
  const summaryRows: [string, string][] = [
    ["Total de horas", formatMinutes(s.worked_minutes)],
    ["Dias com registo", String(s.paid_days ?? 0)],
    ["Tipo de pagamento", payLabel(s.payment_type_used)],
  ];
  if (type === "hourly") {
    summaryRows.push(["Valor hora aplicado", money(s.rate_used, s.currency)]);
    summaryRows.push(["Total do mês", money(s.calculated_amount, s.currency)]);
  } else if (type === "daily") {
    summaryRows.push(["Valor dia aplicado", money(s.rate_used, s.currency)]);
    summaryRows.push(["Total do mês", money(s.calculated_amount, s.currency)]);
  } else if (type === "monthly") {
    summaryRows.push(["Remuneração mensal", money(s.monthly_amount ?? s.rate_used, s.currency)]);
  } else if (s.calculated_amount != null) {
    summaryRows.push(["Total do mês", money(s.calculated_amount, s.currency)]);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const [k, v] of summaryRows) {
    doc.setTextColor(120);
    doc.text(`${k}:`, MARGIN, y);
    doc.setTextColor(20);
    doc.text(v, MARGIN + 180, y);
    y += 15;
  }

  // ---------- Assinaturas ----------
  if (y > A4.h - 160) newPage(false);
  y = Math.max(y + 30, A4.h - 150);
  const colW = (contentW - 30) / 2;

  if (sigData) {
    try {
      doc.addImage(sigData, "PNG", MARGIN + 8, y - 46, 150, 42);
    } catch {
      /* assinatura inválida: mantém linha em branco */
    }
  }
  doc.setDrawColor(120);
  doc.line(MARGIN, y, MARGIN + colW, y);
  doc.line(MARGIN + colW + 30, y, A4.w - MARGIN, y);
  y += 13;
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Assinatura do Colaborador", MARGIN, y);
  doc.text("Assinatura do Responsável / Carimbo", MARGIN + colW + 30, y);
  y += 22;

  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(
    `Gerado em ${new Date(snapshot.generated_at).toLocaleString("pt-PT")}${
      opts.versionLabel ? ` · ${opts.versionLabel}` : ""
    } · OmniBiz Suite`,
    MARGIN,
    y,
  );

  // Numeração de páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${total}`, A4.w - MARGIN, A4.h - 24, { align: "right" });
  }
  void page;

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Junta vários PDFs num único documento (impressão/download em lote). */
export async function mergePdfs(files: (Uint8Array | ArrayBuffer)[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(f as ArrayBuffer);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return await out.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function printBytes(bytes: Uint8Array) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) {
    w.addEventListener("load", () => w.print(), { once: true });
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
