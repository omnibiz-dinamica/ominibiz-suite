/**
 * Padrão de exportação OmniBiz — Excel (.xlsx) e PDF.
 * Reutilizável para Clientes, Ponto, Recibos etc.
 * Branding por empresa (nome, cor primária, logo opcional).
 */
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn<T> {
  header: string;
  /** Função que extrai o valor a exibir. */
  accessor: (row: T) => string | number | null | undefined;
  /** Largura sugerida (PDF, em pontos). */
  width?: number;
}

export interface ExportMeta {
  /** Nome do arquivo, sem extensão. */
  fileName: string;
  /** Título exibido no topo do PDF / planilha. */
  title: string;
  /** Nome da empresa (branding). */
  companyName?: string | null;
  /** Cor primária (#RRGGBB) — header do PDF. */
  primaryColor?: string | null;
  /** Subtítulo opcional (ex.: filtros aplicados, período). */
  subtitle?: string | null;
}

const todayBR = () =>
  new Date().toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

const safeHex = (c?: string | null): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? "");
  if (!m) return [59, 130, 246]; // fallback OmniBiz blue
  const v = m[1];
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
};

export function exportToExcel<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  meta: ExportMeta,
): void {
  const header = columns.map((c) => c.header);
  const body = rows.map((r) => columns.map((c) => c.accessor(r) ?? ""));

  const aoa: (string | number)[][] = [
    [meta.title],
    [meta.companyName ?? ""],
    [meta.subtitle ?? ""],
    [`Gerado em ${todayBR()} — ${rows.length} registo(s)`],
    [],
    header,
    ...body,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(c.header.length + 2, 18) }));
  // Negrito no título e header (XLSX só aplica estilos via SheetJS Pro,
  // mas mantemos o merge para visual de capa).
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(columns.length - 1, 0) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(columns.length - 1, 0) } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: Math.max(columns.length - 1, 0) } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: Math.max(columns.length - 1, 0) } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, meta.title.slice(0, 31) || "Export");
  XLSX.writeFile(wb, `${meta.fileName}.xlsx`);
}

export function exportToPdf<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  meta: ExportMeta,
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const [r, g, b] = safeHex(meta.primaryColor);
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header colorido com branding
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, 56, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(meta.title, 32, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (meta.companyName) doc.text(meta.companyName, 32, 46);
  doc.text(todayBR(), pageWidth - 32, 46, { align: "right" });

  if (meta.subtitle) {
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(meta.subtitle, 32, 76);
  }

  autoTable(doc, {
    startY: meta.subtitle ? 90 : 72,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) =>
      columns.map((c) => {
        const v = c.accessor(row);
        return v === null || v === undefined ? "" : String(v);
      }),
    ),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, c.width ? { cellWidth: c.width } : {}]),
    ),
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const page = data.pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `${rows.length} registo(s) — página ${page}/${pageCount}`,
        pageWidth - 32,
        doc.internal.pageSize.getHeight() - 16,
        { align: "right" },
      );
    },
  });

  doc.save(`${meta.fileName}.pdf`);
}