import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  expenseInclusion,
  nextMonthOf,
  periodLabel,
  type PaymentExpense,
} from "../src/lib/ponto/payment-summary";
import { closingNextStep } from "../src/lib/ponto/closing-steps";

const exp = (id: string, amount: number, attached: boolean): PaymentExpense => ({
  id,
  date: "2026-10-05",
  amount,
  reason: "Combustível",
  attached,
});

describe("SUP-301 — despesas e transitar no Resumo para pagamento", () => {
  test("mês seguinte vira o ano em dezembro", () => {
    expect(nextMonthOf(2026, 9)).toEqual({ year: 2026, month: 10 });
    expect(nextMonthOf(2026, 12)).toEqual({ year: 2027, month: 1 });
    expect(periodLabel(2026, 10)).toBe("10/2026");
    expect(periodLabel(null, 10)).toBe("");
  });

  test("separa despesas por incluir e já incluídas", () => {
    const r = expenseInclusion({
      expenses: [exp("a", 10, false), exp("b", 20.5, false), exp("c", 5, true)],
    });
    expect(r.pending.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.attached.map((x) => x.id)).toEqual(["c"]);
    expect(r.pendingTotal).toBeCloseTo(30.5);
  });

  test("ecrã: incluir, retirar, aplicar no mês seguinte e etiqueta em Despesas", () => {
    const page = readFileSync("src/routes/app.ponto_.pagamento.tsx", "utf8");
    expect(page).toContain("attachExpenses(");
    expect(page).toContain("detachExpense(");
    expect(page).toContain("(transitar)");
    // incluir é sempre um clique do gestor, nunca ao abrir o ecrã
    expect(page).not.toMatch(/useEffect\([^)]*attachExpenses/);
    const desp = readFileSync("src/routes/app.despesas.tsx", "utf8");
    expect(desp).toContain('data-testid="expense-payroll-month"');
  });

  test("SQL: incluída conta sempre; por incluir só 'Aguarda pagamento'; protegida", () => {
    const sql = readFileSync("docs/sql/despesas_pagamento_20261119_aplicar.sql", "utf8");
    expect(sql).toContain(
      "AND (x.payroll_year IS NOT NULL OR x.payment_status = ''aguardando_pagamento'') -- SUP-301",
    );
    expect(sql).toContain("AND x.payment_status = ''aguardando_pagamento'' -- SUP-301");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.employee_expenses");
    expect(sql).toContain("RAISE EXCEPTION 'PARAR: este script já foi aplicado");
    const undo = readFileSync("docs/sql/despesas_pagamento_20261119_desfazer.sql", "utf8");
    expect(undo).toContain("DROP TRIGGER IF EXISTS trg_employee_expenses_payroll_lock");
  });
});

describe("SUP-300 — corrigir e fechar no mesmo sítio", () => {
  test("o Ver do Fechamento tem o botão Fechar folha, só quando já pode fechar", () => {
    const dlg = readFileSync("src/components/ponto/TimesheetViewerDialog.tsx", "utf8");
    expect(dlg).toContain('data-testid="viewer-close-sheet"');
    expect(dlg).toContain("closingNextStep(row.status).canClose");
    const page = readFileSync("src/routes/app.ponto_.fechamento.tsx", "utf8");
    expect(page).toContain("onCloseSheet={async (r)");
    expect(closingNextStep("assinado_funcionario").canClose).toBe(true);
    expect(closingNextStep("aguardando_funcionario").canClose).toBe(false);
  });
});
