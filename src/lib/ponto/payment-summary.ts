/**
 * Resumo para pagamento (SUP-2026-000302, 15/11/2026).
 *
 * Por funcionário e mês: o que a folha de ponto contabilizou (linhas de
 * pagamento da folha) + renda/transporte/alimentação/outros do cadastro,
 * despesas, acréscimos/descontos, total, adiantamento (avanço) e 2.º
 * pagamento. Os números vêm do banco (payroll_payment_summary); aqui é só
 * apresentação e exportação.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TimesheetClientTotal, TimesheetDayTypeTotals } from "@/lib/timesheet";

export type PayLine = {
  order?: string;
  code: string;
  label: string;
  unit: string;
  quantity: number | null;
  minutes?: number | null;
  rate: number | null;
  amount: number;
};

export type PaymentExtra = {
  code?: string;
  label?: string;
  amount: number;
  reason?: string | null;
};
export type PaymentAdjustment = {
  id: string;
  kind: "acrescimo" | "desconto";
  amount: number;
  reason: string;
  origin_label: string | null;
  created_at: string;
};
export type PaymentExpense = {
  id: string;
  date: string;
  amount: number;
  reason: string | null;
  attached: boolean;
};

export type PaymentEmployee = {
  employee_id: string;
  full_name: string;
  period_status: string;
  final: boolean;
  source: "versao" | "provisorio";
  version: number | null;
  payment_type_used: string | null;
  worked_minutes: number;
  paid_days: number;
  by_day_type: TimesheetDayTypeTotals | null;
  by_client: TimesheetClientTotal[];
  pay_lines: PayLine[] | null;
  work_total: number;
  allowances: PaymentExtra[];
  expenses: PaymentExpense[];
  adjustments: PaymentAdjustment[];
  allowances_total: number;
  expenses_total: number;
  adjustments_total: number;
  total: number;
  advance: number;
  second_payment: number;
  notes: string | null;
};

export type PaymentSummary = {
  company_id: string;
  period: { year: number; month: number };
  currency: string;
  generated_at: string;
  employees: PaymentEmployee[];
};

export async function fetchPaymentSummary(companyId: string, year: number, month: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("payroll_payment_summary", {
    _company_id: companyId,
    _year: year,
    _month: month,
  });
  if (error) throw error;
  return data as PaymentSummary;
}

export async function setAdvance(p: {
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
  amount: number;
  notes?: string | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("payroll_set_advance", {
    _company_id: p.companyId,
    _employee_id: p.employeeId,
    _year: p.year,
    _month: p.month,
    _amount: p.amount,
    _notes: p.notes?.trim() ? p.notes.trim() : null,
  });
  if (error) throw error;
}

export async function addAdjustment(p: {
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
  kind: "acrescimo" | "desconto";
  amount: number;
  reason: string;
  label?: string | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("payroll_add_adjustment", {
    _company_id: p.companyId,
    _employee_id: p.employeeId,
    _target_year: p.year,
    _target_month: p.month,
    _kind: p.kind,
    _amount: p.amount,
    _reason: p.reason.trim(),
    _origin_label: p.label?.trim() ? p.label.trim().slice(0, 60) : null,
  });
  if (error) throw error;
}

/** Mês seguinte (para transitar um acerto: "pagou-se a mais em setembro"). */
export function nextMonthOf(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** "10/2026" */
export function periodLabel(year: number | null | undefined, month: number | null | undefined) {
  return year && month ? `${String(month).padStart(2, "0")}/${year}` : "";
}

/**
 * SUP-301 (19/11/2026): despesas "Aguarda pagamento" ainda não incluídas
 * (attached=false) e as já incluídas neste mês.
 */
export function expenseInclusion(e: Pick<PaymentEmployee, "expenses">) {
  const pending = e.expenses.filter((x) => !x.attached);
  return {
    pending,
    attached: e.expenses.filter((x) => x.attached),
    pendingTotal: pending.reduce((s, x) => s + Number(x.amount ?? 0), 0),
  };
}

/** Inclui no pagamento deste mês as despesas "Aguarda pagamento" (todos ou um funcionário). */
export async function attachExpenses(p: {
  companyId: string;
  year: number;
  month: number;
  employeeId?: string | null;
}): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("payroll_attach_expenses", {
    _company_id: p.companyId,
    _year: p.year,
    _month: p.month,
    _employee_id: p.employeeId ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Retira a despesa do pagamento do mês (não se já estiver paga — o banco recusa). */
export async function detachExpense(id: string, reason: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("payroll_detach_expense", {
    _expense_id: id,
    _reason: reason,
  });
  if (error) throw error;
}

export async function voidAdjustment(id: string, reason: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("payroll_void_adjustment", {
    _id: id,
    _reason: reason,
  });
  if (error) throw error;
}

/** Uma linha do resumo: quantidade · item · valor unitário = valor. */
export type SummaryRow = {
  key: string;
  quantity: string;
  label: string;
  rate: string;
  amount: number;
  kind: "work" | "extra" | "discount";
};

const n2 = (v: number | null | undefined) =>
  v == null || !Number.isFinite(Number(v)) ? "" : Number(v).toFixed(2).replace(".", ",");
const qty = (v: number | null | undefined) =>
  v == null ? "" : Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(2).replace(".", ",");

/**
 * Linhas do trabalho: as linhas de pagamento da folha; em folhas antigas (sem
 * linhas), a composição por cliente; sem nada, uma linha com o total.
 */
export function workRows(e: PaymentEmployee): SummaryRow[] {
  if (e.pay_lines && e.pay_lines.length > 0) {
    return e.pay_lines.map((l) => ({
      key: `w:${l.code}`,
      quantity: qty(l.quantity),
      label: l.label,
      rate: n2(l.rate ?? (l.quantity ? Number(l.amount) / Number(l.quantity) : null)),
      amount: Number(l.amount ?? 0),
      kind: "work" as const,
    }));
  }
  if (e.by_client.length > 0) {
    return e.by_client.map((c) => ({
      key: `c:${c.client_id ?? "sem"}:${c.pay_model}`,
      quantity: c.pay_model === "daily" ? String(c.days) : qty(Number(c.minutes ?? 0) / 60),
      label: c.client_name,
      rate: n2(c.unit_rate),
      amount: Number(c.amount ?? 0),
      kind: "work" as const,
    }));
  }
  return [
    {
      key: "w:total",
      quantity: qty(e.worked_minutes / 60),
      label: "Trabalho",
      rate: "",
      amount: Number(e.work_total ?? 0),
      kind: "work",
    },
  ];
}

/** Renda, transporte, alimentação, outros, despesas e acréscimos/descontos. */
export function extraRows(e: PaymentEmployee): SummaryRow[] {
  const out: SummaryRow[] = e.allowances.map((a, i) => ({
    key: `a:${a.code ?? i}`,
    quantity: "1",
    label: a.label ?? "Abono",
    rate: n2(a.amount),
    amount: Number(a.amount ?? 0),
    kind: "extra" as const,
  }));
  if (e.expenses.length > 0) {
    out.push({
      key: "x:expenses",
      quantity: String(e.expenses.length),
      label: "Despesas",
      rate: "",
      amount: Number(e.expenses_total ?? 0),
      kind: "extra",
    });
  }
  for (const a of e.adjustments) {
    const discount = a.kind === "desconto";
    out.push({
      key: `j:${a.id}`,
      quantity: "",
      label: `${discount ? "Desconto" : "Acréscimo"}: ${a.origin_label || a.reason}`,
      rate: "",
      amount: discount ? -Number(a.amount) : Number(a.amount),
      kind: discount ? "discount" : "extra",
    });
  }
  return out;
}

export function formatMoney(v: number | null | undefined, currency = "EUR"): string {
  const x = Number(v ?? 0);
  return `${x.toFixed(2).replace(".", ",")} ${currency === "EUR" ? "€" : currency}`;
}

/** CSV (separador ;) com uma linha por item, para Excel. */
export function paymentSummaryCsv(s: PaymentSummary, employees: PaymentEmployee[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["Funcionário;Folha;Item;Quantidade;Valor unitário;Valor"];
  for (const e of employees) {
    const folha = e.final ? "Fechada" : "Provisória";
    for (const r of [...workRows(e), ...extraRows(e)]) {
      lines.push(
        [e.full_name, folha, r.label, r.quantity, r.rate, n2(r.amount)].map(esc).join(";"),
      );
    }
    lines.push([e.full_name, folha, "TOTAL", "", "", n2(e.total)].map(esc).join(";"));
    lines.push([e.full_name, folha, "Avanço", "", "", n2(e.advance)].map(esc).join(";"));
    lines.push(
      [e.full_name, folha, "2.º pagamento", "", "", n2(e.second_payment)].map(esc).join(";"),
    );
  }
  return `\ufeff${lines.join("\n")}\n`;
}
