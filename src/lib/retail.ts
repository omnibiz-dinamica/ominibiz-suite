import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/** Vertical Lojas · Etapa 1. Toda a escrita de estoque passa por `retail_stock_move`. */
export type RetailUnit = {
  id: string;
  company_id: string;
  name: string;
  code: string;
  legal_name: string | null;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  /** Etapa 2: desconto máximo (%) que um funcionário pode dar no PDV. */
  max_discount_pct?: number;
};
export type RetailCategory = { id: string; company_id: string; name: string; active: boolean };
export type RetailProduct = {
  id: string;
  company_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  price: number;
  cost: number | null;
  active: boolean;
};
export type RetailBalance = { id: string; unit_id: string; product_id: string; quantity: number };
export type RetailMovement = {
  id: string;
  unit_id: string;
  product_id: string;
  kind: "entrada" | "saida" | "transferencia_saida" | "transferencia_entrada" | "ajuste";
  quantity: number;
  balance_after: number | null;
  reason: string;
  related_unit_id: string | null;
  transfer_group_id: string | null;
  user_id: string | null;
  created_at: string;
};
export type MoveKind = "entrada" | "saida" | "transferencia" | "ajuste";

export const PRODUCT_UNITS = ["un", "kg", "g", "l", "ml", "m", "m2", "m3", "cx", "pct"];

export const MOVEMENT_LABEL: Record<RetailMovement["kind"], string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia_saida: "Transferência (saída)",
  transferencia_entrada: "Transferência (entrada)",
  ajuste: "Ajuste",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rdb = (table: string) => (supabase.from as any)(table);

/** País/idioma/moeda da empresa atual (pt-PT/EUR por omissão, pt-BR/BRL no Brasil). */
export function useRetailCompany() {
  const { currentCompanyId } = useAuth();
  const q = useQuery({
    queryKey: ["retail-company", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await rdb("companies")
        .select("id, country, billing_country, billing_currency")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; country: string | null; billing_country: string | null; billing_currency: string | null } | null;
    },
  });
  const country = (q.data?.country || q.data?.billing_country || "PT").toUpperCase();
  const locale = country === "BR" ? "pt-BR" : "pt-PT";
  const currency = q.data?.billing_currency || (country === "BR" ? "BRL" : "EUR");
  return { companyId: currentCompanyId, country, locale, currency, ready: !currentCompanyId || q.isFetched };
}

export function formatMoney(value: number | null | undefined, locale: string, currency: string) {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value));
}

export function formatQty(value: number | null | undefined, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(Number(value ?? 0));
}

/** Converte erros do banco em mensagens claras. */
export function retailErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return "Erro desconhecido";
  if (e.code === "23503" && /retail_(stock_movements|stock_balances|cash_sessions|cash_movements|sales|sale_items|sale_payments)/.test(e.message ?? ""))
    return "Este registo tem histórico (estoque, caixa ou vendas) e não pode ser excluído. Desative-o.";
  if (e.code === "23505") return "Já existe um registo com este código, nome, SKU ou código de barras.";
  if (e.code === "42501") return e.message || "Sem permissão.";
  return e.message || "Erro ao gravar";
}

export function useRetailUnits() {
  const { currentCompanyId } = useAuth();
  return useQuery({
    queryKey: ["retail-units", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await rdb("company_units").select("*").eq("company_id", currentCompanyId!).order("name");
      if (error) throw error;
      return (data ?? []) as RetailUnit[];
    },
  });
}

export function useRetailCategories() {
  const { currentCompanyId } = useAuth();
  return useQuery({
    queryKey: ["retail-categories", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await rdb("retail_product_categories").select("*").eq("company_id", currentCompanyId!).order("name");
      if (error) throw error;
      return (data ?? []) as RetailCategory[];
    },
  });
}

export function useRetailProducts() {
  const { currentCompanyId } = useAuth();
  return useQuery({
    queryKey: ["retail-products", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await rdb("retail_products").select("*").eq("company_id", currentCompanyId!).order("name");
      if (error) throw error;
      return (data ?? []) as RetailProduct[];
    },
  });
}

export function useRetailBalances() {
  const { currentCompanyId } = useAuth();
  return useQuery({
    queryKey: ["retail-balances", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await rdb("retail_stock_balances")
        .select("id, unit_id, product_id, quantity")
        .eq("company_id", currentCompanyId!);
      if (error) throw error;
      return ((data ?? []) as RetailBalance[]).map((b) => ({ ...b, quantity: Number(b.quantity) }));
    },
  });
}

/** IDs que têm histórico (não podem ser excluídos, só desativados). */
export function useRetailHistoryRefs() {
  const { currentCompanyId } = useAuth();
  return useQuery({
    queryKey: ["retail-history-refs", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await rdb("retail_stock_movements")
        .select("unit_id, product_id, related_unit_id")
        .eq("company_id", currentCompanyId!)
        .limit(10000);
      if (error) throw error;
      const units = new Set<string>();
      const products = new Set<string>();
      for (const m of (data ?? []) as { unit_id: string; product_id: string; related_unit_id: string | null }[]) {
        units.add(m.unit_id);
        if (m.related_unit_id) units.add(m.related_unit_id);
        products.add(m.product_id);
      }
      return { units, products };
    },
  });
}

export async function retailStockMove(args: {
  unitId: string;
  productId: string;
  kind: MoveKind;
  quantity: number;
  reason: string;
  relatedUnitId?: string | null;
  idempotencyKey: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("retail_stock_move", {
    _unit_id: args.unitId,
    _product_id: args.productId,
    _kind: args.kind,
    _quantity: args.quantity,
    _reason: args.reason,
    _related_unit_id: args.relatedUnitId ?? null,
    _idempotency_key: args.idempotencyKey,
  });
  if (error) throw error;
  return data as { success: boolean; idempotent_replay: boolean; movement_id: string };
}

export const RETAIL_ROLES = ["manager", "owner", "super_admin"] as const;

// ---------------------------------------------------------------------------
// Etapa 2 · Caixa e PDV. Toda a escrita passa pelas RPCs retail_cash_* e
// retail_sale_*; o preço vem sempre do cadastro (o cliente não envia preços).
// ---------------------------------------------------------------------------

/** Quem opera PDV/Caixa/Vendas: gestores e funcionários vinculados à loja (RLS/RPC decidem a loja). */
export const RETAIL_OPERATOR_ROLES = ["manager", "owner", "super_admin", "employee"] as const;

export type PaymentMethod =
  | "dinheiro"
  | "cartao_debito"
  | "cartao_credito"
  | "pix"
  | "mbway"
  | "multibanco"
  | "transferencia"
  | "outro";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  cartao_debito: "Cartão de débito",
  cartao_credito: "Cartão de crédito",
  pix: "PIX",
  mbway: "MB WAY",
  multibanco: "Multibanco",
  transferencia: "Transferência",
  outro: "Outro",
};

/** Formas de pagamento oferecidas por país (o banco aceita todas). */
export function paymentMethodsFor(country: string): PaymentMethod[] {
  return country === "BR"
    ? ["dinheiro", "pix", "cartao_debito", "cartao_credito", "transferencia", "outro"]
    : ["dinheiro", "cartao_debito", "cartao_credito", "mbway", "multibanco", "transferencia", "outro"];
}

export type CashSession = {
  id: string;
  company_id: string;
  unit_id: string;
  status: "aberta" | "fechada";
  opening_amount: number;
  opened_by: string | null;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  totals: CashTotals | null;
  notes: string | null;
};
export type CashTotals = {
  opening_amount: number;
  sales_count: number;
  sales_total: number;
  cancelled_count: number;
  by_method: Partial<Record<PaymentMethod, number>>;
  change_total: number;
  sangria_total: number;
  suprimento_total: number;
  expected_cash: number;
};
export type CashMovement = {
  id: string;
  session_id: string;
  kind: "sangria" | "suprimento";
  amount: number;
  reason: string;
  user_id: string | null;
  created_at: string;
};
export type RetailSale = {
  id: string;
  company_id: string;
  unit_id: string;
  session_id: string;
  number: number;
  code: string;
  seller_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_tax_id: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paid_total: number;
  change_amount: number;
  status: "concluida" | "cancelada";
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};
export type RetailSaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  product_unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};
export type RetailSalePayment = { id: string; sale_id: string; method: PaymentMethod; amount: number };

const num = (v: unknown) => (v == null ? null : Number(v));

/** Caixa aberto de uma loja (ou null). */
export function useOpenCashSession(unitId: string | null | undefined) {
  return useQuery({
    queryKey: ["retail-open-session", unitId],
    enabled: !!unitId,
    queryFn: async () => {
      const { data, error } = await rdb("retail_cash_sessions")
        .select("*")
        .eq("unit_id", unitId!)
        .eq("status", "aberta")
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeSession(data as CashSession) : null;
    },
  });
}

export function normalizeSession(s: CashSession): CashSession {
  return {
    ...s,
    opening_amount: Number(s.opening_amount),
    expected_cash: num(s.expected_cash),
    counted_cash: num(s.counted_cash),
    difference: num(s.difference),
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw error;
  return data as T;
}

export const retailCashOpen = (unitId: string, openingAmount: number, notes?: string) =>
  rpc<{ success: boolean; session_id: string }>("retail_cash_open", { _unit_id: unitId, _opening_amount: openingAmount, _notes: notes ?? null });

export const retailCashMove = (args: { sessionId: string; kind: "sangria" | "suprimento"; amount: number; reason: string; idempotencyKey: string }) =>
  rpc<{ success: boolean; idempotent_replay: boolean }>("retail_cash_move", {
    _session_id: args.sessionId,
    _kind: args.kind,
    _amount: args.amount,
    _reason: args.reason,
    _idempotency_key: args.idempotencyKey,
  });

export const retailCashTotals = (sessionId: string) => rpc<CashTotals>("retail_cash_session_totals", { _session_id: sessionId });

export const retailCashClose = (sessionId: string, countedCash: number, notes?: string) =>
  rpc<{ success: boolean; expected_cash: number; counted_cash: number; difference: number; totals: CashTotals }>("retail_cash_close", {
    _session_id: sessionId,
    _counted_cash: countedCash,
    _notes: notes ?? null,
  });

export type SaleCartLine = { productId: string; quantity: number };
export type SalePaymentInput = { method: PaymentMethod; amount: number };
export type SaleCustomer = { name?: string; phone?: string; email?: string; tax_id?: string };

export const retailSaleCreate = (args: {
  unitId: string;
  lines: SaleCartLine[];
  payments: SalePaymentInput[];
  discount: number;
  customer?: SaleCustomer | null;
  idempotencyKey: string;
}) =>
  rpc<{ success: boolean; idempotent_replay: boolean; sale_id: string; code?: string; total?: number; change_amount?: number }>("retail_sale_create", {
    _unit_id: args.unitId,
    _items: args.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
    _payments: args.payments.map((p) => ({ method: p.method, amount: p.amount })),
    _discount: args.discount,
    _customer: args.customer ?? null,
    _idempotency_key: args.idempotencyKey,
  });

export const retailSaleCancel = (saleId: string, reason: string) =>
  rpc<{ success: boolean; already_cancelled: boolean }>("retail_sale_cancel", { _sale_id: saleId, _reason: reason });

/** Arredonda a 2 casas como o banco (evita 0.1 + 0.2). */
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Cálculo do carrinho igual ao do banco (`retail_sale_create`), só para mostrar na tela.
 * O valor que vale é sempre o devolvido pela RPC.
 */
export function computeCart(
  lines: Array<{ quantity: number; price: number }>,
  discount: number,
  payments: SalePaymentInput[],
) {
  const subtotal = round2(lines.reduce((s, l) => s + round2(l.quantity * l.price), 0));
  const d = round2(Math.max(0, discount || 0));
  const total = round2(Math.max(0, subtotal - d));
  const paid = round2(payments.reduce((s, p) => s + (p.amount > 0 ? p.amount : 0), 0));
  const cash = round2(payments.filter((p) => p.method === "dinheiro").reduce((s, p) => s + (p.amount > 0 ? p.amount : 0), 0));
  const change = round2(Math.max(0, paid - total));
  const problems: string[] = [];
  if (!lines.length) problems.push("Adicione pelo menos um produto.");
  if (d > subtotal) problems.push("O desconto não pode ser maior que o subtotal.");
  if (paid < total) problems.push("Falta pagar " + round2(total - paid).toFixed(2) + ".");
  if (change > cash) problems.push("O troco só pode sair do pagamento em dinheiro.");
  return { subtotal, discount: d, total, paid, cash, change, problems, ok: problems.length === 0 };
}
