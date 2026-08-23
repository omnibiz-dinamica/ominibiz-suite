import { supabase } from "@/integrations/supabase/client";

/**
 * Helper financeiro canónico — Pacote Operacional V2 (ADR-031).
 *
 * Modalidades de pagamento do FUNCIONÁRIO (não confundir com cobrança do cliente):
 *   hourly  → Por Hora   (tempo real × valor hora)
 *   daily   → Por Dia / Fixo diário (valor do dia, 1× por dia trabalhado)
 *   monthly → Por Mês    (remuneração base; nunca multiplicada por horas)
 *
 * Modalidades legadas preservadas (semântica intocada):
 *   fixed   → valor fixo POR TAREFA / empreitada
 *   mixed   → base fixa + horas extra
 *
 * Hierarquia oficial de valores: FUNCIONÁRIO > CLIENTE > EMPRESA.
 * A resolução autoritativa vive no banco (`resolve_effective_compensation`,
 * `resolve_billing_rule`) — este módulo é a única porta de entrada no frontend.
 * Proibido reimplementar a hierarquia em telas.
 */

export type PaymentType = "hourly" | "daily" | "monthly" | "fixed" | "mixed";
export type CompensationSource = "employee" | "client" | "company";

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  hourly: "Por Hora",
  daily: "Por Dia / Fixo",
  monthly: "Por Mês",
  fixed: "Valor fixo por tarefa",
  mixed: "Misto (base + horas)",
};

/** Modalidades oferecidas no cadastro do Funcionário. */
export const EMPLOYEE_PAYMENT_TYPES: PaymentType[] = ["hourly", "daily", "monthly"];

export const COMPENSATION_SOURCE_LABEL: Record<CompensationSource, string> = {
  employee: "Funcionário",
  client: "Cliente",
  company: "Empresa",
};

/** Mapeia as fontes gravadas nos snapshots (`time_entry_valuations.rate_source`). */
export function normalizeSource(raw: string | null | undefined): CompensationSource | null {
  if (!raw) return null;
  if (raw === "employee_manual" || raw === "employee") return "employee";
  if (raw === "client") return "client";
  if (raw === "company_default" || raw === "company") return "company";
  return null;
}

export function sourceLabel(raw: string | null | undefined): string {
  const s = normalizeSource(raw);
  return s ? COMPENSATION_SOURCE_LABEL[s] : "—";
}

/** Sufixo de unidade por modalidade — usado em toda a UI. */
export function rateUnit(type: PaymentType): string {
  switch (type) {
    case "hourly":
      return "/ hora";
    case "daily":
      return "/ dia";
    case "monthly":
      return "/ mês";
    case "fixed":
      return "/ tarefa";
    default:
      return "";
  }
}

export function formatRate(
  value: number | null | undefined,
  type: PaymentType,
  currency = "EUR",
): string {
  if (value == null) return "—";
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${Number(value).toFixed(2)} ${rateUnit(type)}`.trim();
}

/** Total aplicável na folha conforme a modalidade. */
export function computeLineTotal(input: {
  paymentType: PaymentType;
  appliedRate: number | null;
  realMinutes: number | null;
  /** Para `daily`: false quando o dia já foi pago noutro registo. */
  dayPayable?: boolean;
}): number | null {
  const { paymentType, appliedRate, realMinutes } = input;
  if (appliedRate == null) return null;
  switch (paymentType) {
    case "hourly":
      if (realMinutes == null) return null;
      return Math.round(((realMinutes / 60) * appliedRate + Number.EPSILON) * 100) / 100;
    case "daily":
      return input.dayPayable === false ? 0 : appliedRate;
    case "monthly":
      // Remuneração base: nunca multiplicada por horas, nem somada por registo.
      return null;
    case "fixed":
      return appliedRate;
    default:
      return null;
  }
}

export interface EffectiveCompensation {
  payment_type: PaymentType;
  applied_rate: number;
  source: CompensationSource;
  currency: string;
  effective_date: string;
}

/**
 * Resolve o valor efetivo (FUNCIONÁRIO > CLIENTE > EMPRESA) no servidor.
 * `client_id` opcional: sem cliente, o fallback é diretamente a empresa.
 */
export async function resolveEffectiveCompensation(params: {
  employeeId: string;
  clientId?: string | null;
  companyId?: string | null;
}): Promise<EffectiveCompensation> {
  const { data, error } = await (supabase as any).rpc("resolve_effective_compensation", {
    _employee_id: params.employeeId,
    _client_id: params.clientId ?? null,
    _company_id: params.companyId ?? null,
  });
  if (error) throw error;
  return data as EffectiveCompensation;
}
