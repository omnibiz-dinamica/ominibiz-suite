import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { APPROVED_STAGES, STAGE_LABEL, expenseStage, stageChange } from "../src/lib/expense-stage";

const page = readFileSync("src/routes/app.despesas.tsx", "utf8");
const sqlApply = readFileSync("docs/sql/despesa_estados_20261117_aplicar.sql", "utf8");

describe("SUP-331 — estados da despesa", () => {
  test("um só estado por despesa", () => {
    expect(expenseStage({ status: "pendente", payment_status: null })).toBe("pendente");
    expect(expenseStage({ status: "rejeitada", payment_status: null })).toBe("rejeitada");
    expect(expenseStage({ status: "aprovada", payment_status: null })).toBe("aprovada");
    expect(expenseStage({ status: "aprovada", payment_status: "aguardando_pagamento" })).toBe(
      "aguardando_pagamento",
    );
    expect(expenseStage({ status: "aprovada", payment_status: "paga" })).toBe("paga");
    expect(APPROVED_STAGES.map((s) => STAGE_LABEL[s])).toEqual([
      "Aprovada",
      "Aguarda pagamento",
      "Paga",
    ]);
  });

  test("mudanças no lápis", () => {
    expect(stageChange("aprovada", "aprovada")).toEqual({ kind: "none" });
    expect(stageChange("aprovada", "aguardando_pagamento")).toEqual({
      kind: "payment",
      value: "aguardando_pagamento",
    });
    expect(stageChange("aguardando_pagamento", "paga")).toEqual({ kind: "payment", value: "paga" });
    expect(stageChange("paga", "aprovada")).toEqual({ kind: "payment", value: "aprovada" });
    expect(stageChange("aprovada", "pendente")).toEqual({ kind: "revert" });
    expect(stageChange("paga", "pendente")).toEqual({ kind: "none" }); // paga não volta a pendente
    expect(stageChange("pendente", "paga")).toEqual({ kind: "none" }); // aprovar/rejeitar continua nos botões
  });

  test("cartão mostra só o estado atual; sem botões de estado soltos", () => {
    expect(page).toContain("{tr(STAGE_LABEL[expenseStage(r)])}"); // 22/11: rótulo traduzido
    expect(page).not.toContain("Marcar paga");
    expect(page).not.toContain("Aguardar pagamento\n");
    expect(page).toContain('data-testid="expense-stage-select"');
  });

  test("SQL: aprovar deixa Aprovada; marcar aceita 'aprovada' (NULL); guardas e cópia", () => {
    expect(sqlApply).toContain("'payment_status = NULL, -- SUP-331");
    expect(sqlApply).toContain("NULLIF(_payment_status, ''aprovada'')");
    expect(sqlApply).toContain("RAISE EXCEPTION 'PARAR: este script já foi aplicado.");
    expect(sqlApply).toContain("_omnibiz_fn_backup");
  });
});
