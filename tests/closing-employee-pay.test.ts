import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dayTypeRows, holidayLabels, missingEmployeeRate } from "../src/lib/ponto/day-type-summary";
import { closingNextStep } from "../src/lib/ponto/closing-steps";
import type { TimesheetStatus } from "../src/lib/timesheet";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("14/11/2026: horas da semana e do fim de semana/feriado", () => {
  const t = {
    week_minutes: 690,
    weekend_minutes: 300,
    holiday_minutes: 120,
    week_days: 4,
    weekend_days: 2,
    week_amount: 96,
    weekend_amount: 62.5,
    holidays: ["2026-11-11", "2026-11-01"],
  };

  test("duas linhas a partir do resumo do banco; folhas antigas não mostram nada", () => {
    expect(dayTypeRows(t)?.map((r) => [r.key, r.minutes, r.days, r.amount])).toEqual([
      ["week", 690, 4, 96],
      ["weekend", 300, 2, 62.5],
    ]);
    expect(dayTypeRows(undefined)).toBeNull();
    expect(holidayLabels(t)).toEqual(["01/11", "11/11"]);
  });

  test("aviso quando há horas a 0,00 (falta valor no cadastro do funcionário)", () => {
    const row = { client_id: "c", client_name: "X", entries: 1, days: 1, amount: 0 };
    expect(missingEmployeeRate([{ ...row, pay_model: "hourly", unit_rate: 0, minutes: 60 }])).toBe(
      true,
    );
    expect(
      missingEmployeeRate([{ ...row, pay_model: "hourly", unit_rate: 11.5, minutes: 60 }]),
    ).toBe(false);
    // folga remunerada (fixo, 0 h) e valores mistos (null) não avisam
    expect(missingEmployeeRate([{ ...row, pay_model: "fixed", unit_rate: 0, minutes: 0 }])).toBe(
      false,
    );
    expect(
      missingEmployeeRate([{ ...row, pay_model: "hourly", unit_rate: null, minutes: 60 }]),
    ).toBe(false);
  });

  test("a folha e o PDF mostram os dois somatórios", () => {
    expect(read("../src/components/ponto/TimesheetViewerDialog.tsx")).toContain(
      "dayTypeRows(summary.by_day_type)",
    );
    expect(read("../src/lib/timesheet-pdf.ts")).toContain("dayTypeRows(s.by_day_type)");
  });
});

describe("14/11/2026: fecho do mês passo a passo", () => {
  const steps = (s: TimesheetStatus) => closingNextStep(s);

  test("Fechar só depois da assinatura; Enviar só depois de fechar (como o banco)", () => {
    expect(steps("aguardando_funcionario")).toMatchObject({
      step: 2,
      canClose: false,
      canSend: false,
    });
    expect(steps("aguardando_correcao")).toMatchObject({ canClose: false, canSend: false });
    expect(steps("assinado_funcionario")).toMatchObject({
      step: 3,
      canClose: true,
      canSend: false,
    });
    expect(steps("em_conferencia")).toMatchObject({ canClose: true });
    expect(steps("fechado_gestor")).toMatchObject({ step: 4, canClose: false, canSend: true });
    expect(steps("disponivel_contabilidade")).toMatchObject({
      step: 5,
      canClose: false,
      canSend: false,
    });
  });

  test('o botão deixa de se chamar "Liberar" e o estado deixa claro que espera o funcionário', () => {
    const page = read("../src/routes/app.ponto_.fechamento.tsx");
    expect(page).not.toMatch(/>\s*Liberar\s*</);
    expect(page).toContain("disabled={!closingNextStep(r.status).canSend}");
    expect(page).toContain("Como fechar o mês (passo a passo)");
    expect(read("../src/lib/timesheet.ts")).toContain(
      'aguardando_funcionario: "Aguardando assinatura do funcionário"',
    );
  });

  test("o SQL paga pelo valor do funcionário e tem desfazer", () => {
    const sql = read("../docs/sql/pagamento_funcionario_20261114_aplicar.sql");
    expect(sql).toContain(
      "RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.'",
    );
    expect(sql).toContain(
      "v_hour := CASE WHEN v_day_type IN ('weekend', 'holiday') THEN v_weekend ELSE v_week END;",
    );
    expect(sql).toContain("lower(btrim(COALESCE(cli.name, ''))) = 'folga remunerada'");
    expect(read("../docs/sql/pagamento_funcionario_20261114_desfazer.sql")).toContain(
      "DROP FUNCTION IF EXISTS public.omnibiz_day_type(date, text);",
    );
  });
});
