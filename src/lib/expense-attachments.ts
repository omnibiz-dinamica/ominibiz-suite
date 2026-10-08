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

/* ---------- Seleção única: filtros do Histórico ---------- */

export type ExpenseSelectionFilters = {
  status: "all" | "pendente" | "aprovada" | "rejeitada";
  payment: "all" | "aguardando_pagamento" | "paga";
  userId: string | "all";
  dateBy: "expense_date" | "created_at";
  start: string;
  end: string;
};

export type ExpenseSelectionRow = {
  status: string;
  payment_status: string | null;
  expense_date: string;
  created_at: string;
  user_id: string;
  amount: number;
  attachment_path: string | null;
};

/** "Aguarda pagamento" = aprovada e ainda não paga (inclui sem estado); "Paga" = paga. */
export function matchesExpenseFilters(r: ExpenseSelectionRow, f: ExpenseSelectionFilters): boolean {
  if (f.status !== "all" && r.status !== f.status) return false;
  if (f.payment === "paga" && r.payment_status !== "paga") return false;
  if (f.payment === "aguardando_pagamento" && (r.status !== "aprovada" || r.payment_status === "paga")) return false;
  if (f.userId !== "all" && r.user_id !== f.userId) return false;
  const d = f.dateBy === "expense_date" ? r.expense_date : new Date(r.created_at).toISOString().slice(0, 10);
  if (f.start && d < f.start) return false;
  if (f.end && d > f.end) return false;
  return true;
}

export function filterExpenses<T extends ExpenseSelectionRow>(rows: T[], f: ExpenseSelectionFilters): T[] {
  return rows.filter((r) => matchesExpenseFilters(r, f));
}

/** Parâmetros enviados à rota de comprovantes: exatamente os filtros do Histórico. */
export function expenseFilterParams(f: ExpenseSelectionFilters): URLSearchParams {
  const p = new URLSearchParams({ dateBy: f.dateBy });
  if (f.status !== "all") p.set("status", f.status);
  if (f.payment !== "all") p.set("payment", f.payment);
  if (f.userId !== "all") p.set("userId", f.userId);
  if (f.start) p.set("start", f.start);
  if (f.end) p.set("end", f.end);
  return p;
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Atalhos: devolvem apenas datas inicial/final. */
export function monthShortcut(kind: "current" | "previous", today = new Date()): { start: string; end: string } {
  const offset = kind === "current" ? 0 : -1;
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
  return { start: isoDay(first), end: isoDay(last) };
}

export function summarizeExpenseSelection(rows: ExpenseSelectionRow[]) {
  const withFile = rows.filter((r) => Boolean(r.attachment_path)).length;
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const byStatus = { aprovada: 0, pendente: 0, rejeitada: 0 } as Record<string, number>;
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const statusText = [
    byStatus.aprovada ? plural(byStatus.aprovada, "aprovada", "aprovadas") : null,
    byStatus.pendente ? plural(byStatus.pendente, "pendente", "pendentes") : null,
    byStatus.rejeitada ? plural(byStatus.rejeitada, "rejeitada", "rejeitadas") : null,
  ].filter(Boolean).join(" · ");
  const nonApproved = (byStatus.pendente ?? 0) + (byStatus.rejeitada ?? 0);
  const nonApprovedWithFile = rows.filter((r) => r.attachment_path && r.status !== "aprovada").length;
  return {
    count: rows.length,
    total,
    totalText: total.toLocaleString("pt-PT", { style: "currency", currency: "EUR" }),
    withFile,
    missing: rows.length - withFile,
    byStatus,
    statusText,
    nonApproved,
    nonApprovedWithFile,
  };
}

/** Ex.: comprovantes-2026-10-01_2026-10-08-paga.zip */
export function attachmentArchiveName(f: ExpenseSelectionFilters, employeeName?: string | null): string {
  const slug = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const period = `${f.start || "inicio"}_${f.end || "fim"}`;
  const parts = [
    f.dateBy === "created_at" ? "envio" : null,
    f.status !== "all" ? f.status : null,
    f.payment === "paga" ? "paga" : f.payment === "aguardando_pagamento" ? "aguarda-pagamento" : null,
    f.userId !== "all" ? slug(employeeName || "colaborador") : null,
  ].filter(Boolean);
  return `comprovantes-${period}${parts.length ? `-${parts.join("-")}` : ""}.zip`;
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
