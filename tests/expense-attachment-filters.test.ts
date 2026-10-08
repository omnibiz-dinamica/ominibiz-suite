import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  attachmentArchiveName, describeExpenseFilters, selectAttachmentExpenses, summarizeAttachmentExpenses,
} from "../src/lib/expense-attachments";

const page = readFileSync("src/routes/app.despesas.tsx", "utf8");
const api = readFileSync("src/routes/api/expenses/attachments.ts", "utf8");
const row = (id: string, status: string, payment: string | null, extra: Partial<{ user_id: string; expense_date: string; attachment_path: string | null; amount: number }> = {}) => ({
  id, status, payment_status: payment, expense_date: "2026-10-05", user_id: "u1", amount: 10, attachment_path: `p/${id}.jpg`, ...extra,
});
const rows = [
  row("a", "aprovada", "aguardando_pagamento"),
  row("b", "aprovada", null),
  row("c", "aprovada", "paga", { amount: 25 }),
  row("d", "pendente", null),
  row("e", "rejeitada", null),
  row("f", "aprovada", "paga", { expense_date: "2026-11-02" }),
  row("g", "aprovada", "aguardando_pagamento", { user_id: "u2", attachment_path: null }),
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

describe("comprovantes e exportação respeitam os filtros", () => {
  test("(a) Excel/PDF usam as linhas filtradas e mostram os filtros", () => {
    expect(page).toContain("exportToExcel(filtered, columns, meta)");
    expect(page).toContain("exportToPdf(filtered, columns, meta)");
    expect(describeExpenseFilters({ statusLabel: "Aprovada", paymentLabel: "Aguarda pagamento", employeeName: null, dateBy: "expense_date", start: "2026-10-01", end: "2026-10-31" }))
      .toBe("Estado: Aprovada · Pagamento: Aguarda pagamento · Colaborador: Todos · Data da despesa: 01/10/2026–31/10/2026");
  });
  test("(b) Aguarda pagamento só aprovadas não pagas", () => {
    expect(ids(selectAttachmentExpenses(rows, { month: "2026-10", payment: "aguardando_pagamento", userId: "all" }))).toEqual(["a", "b", "g"]);
    expect(api).toContain('payment_status.is.null,payment_status.neq.paga');
  });
  test("(c) Paga só aprovadas pagas", () => {
    expect(ids(selectAttachmentExpenses(rows, { month: "2026-10", payment: "paga", userId: "all" }))).toEqual(["c"]);
  });
  test("(d) pendentes e rejeitadas nunca entram", () => {
    for (const payment of ["all", "paga", "aguardando_pagamento"] as const) {
      const got = ids(selectAttachmentExpenses(rows, { month: "2026-10", payment, userId: "all" }));
      expect(got).not.toContain("d");
      expect(got).not.toContain("e");
    }
    expect(api).toContain('.eq("status", "aprovada")');
  });
  test("(e) nome do arquivo e resumo refletem o filtro", () => {
    expect(attachmentArchiveName("2026-10", "aguardando_pagamento")).toBe("comprovantes-2026-10-aguarda-pagamento.zip");
    const sel = selectAttachmentExpenses(rows, { month: "2026-10", payment: "aguardando_pagamento", userId: "all" });
    const s = summarizeAttachmentExpenses(sel, { month: "2026-10", payment: "aguardando_pagamento" });
    expect(s.count).toBe(2);
    expect(s.missing).toBe(1);
    expect(s.text).toContain("2 comprovantes");
    expect(s.text).toContain("Aguarda pagamento");
    expect(s.text).toContain("outubro de 2026");
    expect(page).toContain("Nenhum comprovante para estes filtros");
  });
  test("(f) padrão Todas as aprovadas = comportamento atual", () => {
    expect(page).toContain('useState<AttachmentPaymentFilter>("all")');
    expect(ids(selectAttachmentExpenses(rows, { month: "2026-10", payment: "all", userId: "all" }))).toEqual(["a", "b", "c", "g"]);
    expect(api).toContain('if (payment === "paga")');
  });
});
