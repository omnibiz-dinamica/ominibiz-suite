import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  attachmentArchiveName, describeExpenseFilters, expenseFilterParams, filterExpenses, monthShortcut,
  summarizeExpenseSelection, type ExpenseSelectionFilters,
} from "../src/lib/expense-attachments";

const page = readFileSync("src/routes/app.despesas.tsx", "utf8");
const api = readFileSync("src/routes/api/expenses/attachments.ts", "utf8");
const lib = readFileSync("src/lib/expense-attachments.ts", "utf8");
const row = (id: string, status: string, payment: string | null, extra: Partial<{ user_id: string; expense_date: string; attachment_path: string | null; amount: number; created_at: string }> = {}) => ({
  id, status, payment_status: payment, expense_date: "2026-10-05", created_at: "2026-10-06T10:00:00Z", user_id: "u1", amount: 10, attachment_path: `p/${id}.jpg`, ...extra,
});
const rows = [
  row("a", "aprovada", "aguardando_pagamento"),
  row("b", "aprovada", null),
  row("c", "aprovada", "paga", { amount: 25 }),
  row("d", "pendente", null),
  row("e", "rejeitada", null, { attachment_path: null }),
  row("f", "aprovada", "paga", { expense_date: "2026-11-02" }),
  row("g", "aprovada", "aguardando_pagamento", { user_id: "u2", attachment_path: null }),
];
const all: ExpenseSelectionFilters = { status: "all", payment: "all", userId: "all", dateBy: "expense_date", start: "", end: "" };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

describe("Despesas: um só conjunto de filtros", () => {
  test("(a) comprovantes usam exatamente os filtros do Histórico", () => {
    const f: ExpenseSelectionFilters = { status: "aprovada", payment: "paga", userId: "11111111-1111-4111-8111-111111111111", dateBy: "created_at", start: "2026-10-01", end: "2026-10-08" };
    const p = expenseFilterParams(f);
    expect(Object.fromEntries(p)).toEqual({ dateBy: "created_at", status: "aprovada", payment: "paga", userId: f.userId, start: "2026-10-01", end: "2026-10-08" });
    expect(page).toContain("expenseFilterParams(selection)");
    expect(page).toContain("filterExpenses(rows, selection)");
    for (const key of ['"status"', '"payment"', '"userId"', '"dateBy"', '"start"', '"end"']) expect(api).toContain(`searchParams.get(${key})`);
    expect(api).not.toContain('.eq("status", "aprovada")\n          .gte');
  });
  test("(b) Aguarda pagamento e Paga separam corretamente", () => {
    expect(ids(filterExpenses(rows, { ...all, payment: "aguardando_pagamento" }))).toEqual(["a", "b", "g"]);
    expect(ids(filterExpenses(rows, { ...all, payment: "paga" }))).toEqual(["c", "f"]);
    expect(api).toContain("payment_status.is.null,payment_status.neq.paga");
  });
  test("(c) resumo bate com a lista", () => {
    const sel = filterExpenses(rows, { ...all, start: "2026-10-01", end: "2026-10-31" });
    const s = summarizeExpenseSelection(sel);
    expect(s.count).toBe(sel.length);
    expect(s.total).toBe(sel.reduce((t, r) => t + r.amount, 0));
    expect(s.withFile + s.missing).toBe(s.count);
    expect(s.withFile).toBe(4);
    expect(s.statusText).toBe("4 aprovadas · 1 pendente · 1 rejeitada");
  });
  test("(d) aviso e confirmação com pendentes/rejeitadas", () => {
    const s = summarizeExpenseSelection(filterExpenses(rows, all));
    expect(s.nonApproved).toBe(2);
    expect(s.nonApprovedWithFile).toBe(1);
    expect(summarizeExpenseSelection(filterExpenses(rows, { ...all, status: "aprovada" })).nonApprovedWithFile).toBe(0);
    expect(page).toContain("setConfirmDownload(true)");
    expect(page).toContain("Incluir despesas não aprovadas?");
    expect(page).toContain("Nenhum comprovante para estes filtros");
  });
  test("(e) atalhos de mês só preenchem datas", () => {
    const today = new Date(2026, 0, 15);
    expect(monthShortcut("current", today)).toEqual({ start: "2026-01-01", end: "2026-01-31" });
    expect(monthShortcut("previous", today)).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(page).toContain("setFilterStartDate(r.start)");
    expect(page).not.toContain("Mês dos comprovantes");
  });
  test("(f) nome do arquivo reflete o filtro", () => {
    expect(attachmentArchiveName({ ...all, payment: "paga", start: "2026-10-01", end: "2026-10-08" })).toBe("comprovantes-2026-10-01_2026-10-08-paga.zip");
    expect(attachmentArchiveName({ ...all, status: "aprovada", payment: "aguardando_pagamento", userId: "x", start: "2026-10-01", end: "" }, "João Silva"))
      .toBe("comprovantes-2026-10-01_fim-aprovada-aguarda-pagamento-joao-silva.zip");
  });
  test("(g) Excel/PDF seguem a seleção e mostram os filtros", () => {
    expect(page).toContain("exportToExcel(filtered, columns, meta)");
    expect(page).toContain("exportToPdf(filtered, columns, meta)");
    expect(describeExpenseFilters({ statusLabel: "Aprovada", paymentLabel: "Aguarda pagamento", employeeName: null, dateBy: "expense_date", start: "2026-10-01", end: "2026-10-31" }))
      .toBe("Estado: Aprovada · Pagamento: Aguarda pagamento · Colaborador: Todos · Data da despesa: 01/10/2026–31/10/2026");
  });
  test("(h) não existe botão de imprimir comprovantes", () => {
    expect(page).not.toContain("Imprimir comprovantes");
    expect(page).not.toContain("printAttachments");
    expect(lib).not.toContain("openExpenseAttachmentsPrint");
    expect(page).toContain('"Baixar comprovantes"');
  });
});
