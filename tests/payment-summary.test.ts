import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  extraRows,
  paymentSummaryCsv,
  workRows,
  type PaymentEmployee,
  type PaymentSummary,
} from "../src/lib/ponto/payment-summary";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const emp = (p: Partial<PaymentEmployee> = {}): PaymentEmployee => ({
  employee_id: "e1",
  full_name: "Manuel",
  period_status: "disponivel_contabilidade",
  final: true,
  source: "versao",
  version: 1,
  payment_type_used: "hourly",
  worked_minutes: 5310,
  paid_days: 20,
  by_day_type: null,
  by_client: [],
  pay_lines: [
    {
      code: "hour_week",
      label: "Horas semana",
      unit: "hora",
      quantity: 88.5,
      rate: 13,
      amount: 1150.5,
    },
    {
      code: "hour_weekend",
      label: "Horas fim de semana / feriado",
      unit: "hora",
      quantity: 0,
      rate: null,
      amount: 0,
    },
  ],
  work_total: 1150.5,
  allowances: [{ code: "rent", label: "Renda", amount: 300 }],
  expenses: [],
  adjustments: [
    { id: "a1", kind: "desconto", amount: 20, reason: "Multa", origin_label: null, created_at: "" },
  ],
  allowances_total: 300,
  expenses_total: 0,
  adjustments_total: -20,
  total: 1430.5,
  advance: 500,
  second_payment: 930.5,
  notes: "01-10",
  ...p,
});

describe("SUP-2026-000302: resumo para pagamento", () => {
  test("linhas como no exemplo: quantidade · item · valor = total", () => {
    expect(workRows(emp())[0]).toMatchObject({
      quantity: "88,50",
      label: "Horas semana",
      rate: "13,00",
      amount: 1150.5,
    });
    const extra = extraRows(emp());
    expect(extra.map((r) => [r.label, r.amount])).toEqual([
      ["Renda", 300],
      ["Desconto: Multa", -20],
    ]);
  });

  test("folha antiga sem linhas usa a composição por cliente", () => {
    const rows = workRows(
      emp({
        pay_lines: null,
        by_client: [
          {
            client_id: "c",
            client_name: "Deliva",
            pay_model: "daily",
            unit_rate: 100,
            minutes: 480,
            entries: 1,
            days: 1,
            amount: 100,
          },
        ],
      }),
    );
    expect(rows[0]).toMatchObject({ quantity: "1", label: "Deliva", rate: "100,00", amount: 100 });
  });

  test("CSV com total, avanço e 2.º pagamento por funcionário", () => {
    const s = { currency: "EUR", employees: [emp()] } as unknown as PaymentSummary;
    const csv = paymentSummaryCsv(s, s.employees);
    expect(csv).toContain("Manuel;Fechada;Horas semana;88,50;13,00;1150,50");
    expect(csv).toContain("Manuel;Fechada;TOTAL;;;1430,50");
    expect(csv).toContain("Manuel;Fechada;2.º pagamento;;;930,50");
  });

  test("página, menu e SQL", () => {
    const page = read("../src/routes/app.ponto_.pagamento.tsx");
    expect(page).toContain('createFileRoute("/app/ponto_/pagamento")');
    expect(page).toContain('allow={["manager", "owner", "super_admin"]}');
    expect(read("../src/lib/navigation.ts")).toContain('label: "Resumo para pagamento"');
    const sql = read("../docs/sql/resumo_pagamento_20261115_aplicar.sql");
    expect(sql).toContain("CREATE FUNCTION public.payroll_payment_summary");
    expect(sql).toContain("STABLE SECURITY DEFINER");
    expect(sql).toContain(
      "RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.'",
    );
  });
});
