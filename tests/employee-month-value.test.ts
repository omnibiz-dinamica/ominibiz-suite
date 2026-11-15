import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("SUP-2026-000311: campo 'Valor mês' junto dos valores do funcionário, um só campo", () => {
  const ed = readFileSync(new URL("../src/components/equipe/EmployeeEditor.tsx", import.meta.url), "utf8");
  expect(ed).toContain('<Field label="Valor mês">');
  // um único input para manual_monthly_rate (sem campo duplicado em "Pagamento do funcionário")
  expect(ed.match(/onChange=\{upd\("manual_monthly_rate"\)\}/g)?.length).toBe(1);
  // continua a ser gravado
  expect(ed).toContain("manual_monthly_rate: toNullableNumber(f.manual_monthly_rate)");
});
