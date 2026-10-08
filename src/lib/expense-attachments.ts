import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ExpenseAttachmentManifestItem = {
  id: string;
  expenseDate: string;
  employeeName: string;
  reason: string;
  amount: number;
  mime: string;
  fileName: string;
  signedUrl: string;
};

export function expenseMonthBounds(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const end = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end };
}

export function safeExpenseAttachmentName(item: {
  expenseDate: string;
  employeeName: string;
  reason: string;
  id: string;
  extension: string;
}): string {
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "sem-descricao";
  const extension = item.extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  return `${item.expenseDate}_${clean(item.employeeName)}_${clean(item.reason)}_${item.id.slice(0, 8)}.${extension}`;
}

async function imageAsPng(bytes: ArrayBuffer, mime: string): Promise<ArrayBuffer> {
  if (mime === "image/png") return bytes;
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar uma imagem para impressão.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Não foi possível preparar uma imagem para impressão.");
  return blob.arrayBuffer();
}

function addAttachmentHeading(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  item: ExpenseAttachmentManifestItem,
) {
  const page = doc.addPage([595.28, 841.89]);
  page.drawText(item.employeeName, { x: 42, y: 785, size: 16, font, color: rgb(0.08, 0.13, 0.2) });
  page.drawText(
    `${new Date(`${item.expenseDate}T00:00:00`).toLocaleDateString("pt-PT")} · ${item.amount.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}`,
    { x: 42, y: 760, size: 11, font, color: rgb(0.35, 0.4, 0.46) },
  );
  page.drawText(item.reason.slice(0, 90), { x: 42, y: 736, size: 11, font, color: rgb(0.08, 0.13, 0.2) });
  return page;
}

export async function buildExpenseAttachmentsPdf(
  items: ExpenseAttachmentManifestItem[],
): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.Helvetica);

  for (const item of [...items].sort((a, b) => a.expenseDate.localeCompare(b.expenseDate))) {
    const response = await fetch(item.signedUrl);
    if (!response.ok) throw new Error(`Não foi possível abrir o comprovante de ${item.employeeName}.`);
    const bytes = await response.arrayBuffer();
    if (item.mime === "application/pdf") {
      addAttachmentHeading(output, font, item);
      const source = await PDFDocument.load(bytes);
      const copied = await output.copyPages(source, source.getPageIndices());
      copied.forEach((page) => output.addPage(page));
      continue;
    }

    const page = addAttachmentHeading(output, font, item);
    const image = await output.embedPng(await imageAsPng(bytes, item.mime));
    const availableWidth = 511;
    const availableHeight = 680;
    const scale = Math.min(availableWidth / image.width, availableHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (595.28 - width) / 2, y: 32, width, height });
  }
  return output.save();
}

export function openExpenseAttachmentsPrint(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
  const preview = window.open(url, "_blank");
  if (!preview) {
    URL.revokeObjectURL(url);
    throw new Error("Permita a abertura de janelas para imprimir os comprovantes.");
  }
  preview.addEventListener("load", () => preview.print(), { once: true });
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
/* ---------- Filtros dos comprovantes e do histórico ---------- */

export type AttachmentPaymentFilter = "all" | "aguardando_pagamento" | "paga";

export const ATTACHMENT_PAYMENT_LABEL: Record<AttachmentPaymentFilter, string> = {
  all: "Todas as aprovadas",
  aguardando_pagamento: "Aguarda pagamento",
  paga: "Paga",
};

export type AttachmentCandidate = {
  status: string;
  payment_status: string | null;
  expense_date: string;
  user_id: string;
  amount: number;
  attachment_path: string | null;
};

/** Só APROVADAS do mês; "Aguarda pagamento" inclui aprovadas sem estado de pagamento. */
export function selectAttachmentExpenses<T extends AttachmentCandidate>(
  rows: T[],
  opts: { month: string; payment: AttachmentPaymentFilter; userId: string | "all" },
): T[] {
  const bounds = expenseMonthBounds(opts.month);
  if (!bounds) return [];
  return rows.filter((r) => {
    if (r.status !== "aprovada") return false;
    if (r.expense_date < bounds.start || r.expense_date >= bounds.end) return false;
    if (opts.userId !== "all" && r.user_id !== opts.userId) return false;
    const paid = r.payment_status === "paga";
    if (opts.payment === "paga" && !paid) return false;
    if (opts.payment === "aguardando_pagamento" && paid) return false;
    return true;
  });
}

export function monthLabelPt(month: string): string {
  const bounds = expenseMonthBounds(month);
  if (!bounds) return month;
  return new Date(`${bounds.start}T12:00:00`).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

export function summarizeAttachmentExpenses(
  rows: AttachmentCandidate[],
  opts: { month: string; payment: AttachmentPaymentFilter; employeeName?: string | null },
) {
  const withFile = rows.filter((r) => Boolean(r.attachment_path));
  const total = withFile.reduce((sum, r) => sum + Number(r.amount), 0);
  const missing = rows.length - withFile.length;
  const totalText = total.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  const parts = [
    `${withFile.length} ${withFile.length === 1 ? "comprovante" : "comprovantes"}`,
    totalText,
    ATTACHMENT_PAYMENT_LABEL[opts.payment],
    opts.employeeName ?? null,
    monthLabelPt(opts.month),
  ].filter(Boolean);
  return { count: withFile.length, total, missing, text: parts.join(" · ") };
}

export function attachmentArchiveName(month: string, payment: AttachmentPaymentFilter): string {
  const slug = payment === "all" ? "todas-aprovadas" : payment === "paga" ? "paga" : "aguarda-pagamento";
  return `comprovantes-${month}-${slug}.zip`;
}

/** Cabeçalho do Excel/PDF com TODOS os filtros ativos (inclusive "Todos"). */
export function describeExpenseFilters(f: {
  statusLabel: string | null;
  paymentLabel: string | null;
  employeeName: string | null;
  dateBy: "expense_date" | "created_at";
  start: string;
  end: string;
}): string {
  const fmt = (d: string) => d.split("-").reverse().join("/");
  const range = f.start || f.end ? `${f.start ? fmt(f.start) : "…"}–${f.end ? fmt(f.end) : "…"}` : "Todo o período";
  return [
    `Estado: ${f.statusLabel ?? "Todos"}`,
    `Pagamento: ${f.paymentLabel ?? "Todos"}`,
    `Colaborador: ${f.employeeName ?? "Todos"}`,
    `${f.dateBy === "expense_date" ? "Data da despesa" : "Data de envio"}: ${range}`,
  ].join(" · ");
}
