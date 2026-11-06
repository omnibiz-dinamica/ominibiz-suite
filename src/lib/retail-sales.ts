import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  normalizeSession,
  rdb,
  type CashMovement,
  type CashSession,
  type RetailSale,
  type RetailSaleItem,
  type RetailSalePayment,
} from "@/lib/retail";

/** Leituras de Caixa e Vendas (Lojas · Etapa 2). RLS limita o funcionário às lojas dele. */

const n = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]) => {
  const out = { ...row };
  for (const k of keys)
    if (out[k] != null) (out as Record<string, unknown>)[k as string] = Number(out[k]);
  return out;
};

export function normalizeSale(s: RetailSale): RetailSale {
  return n(s as unknown as Record<string, unknown>, [
    "subtotal",
    "discount",
    "total",
    "paid_total",
    "change_amount",
    "number",
  ]) as unknown as RetailSale;
}

export async function loadSaleDetail(saleId: string) {
  const [sale, items, payments] = await Promise.all([
    rdb("retail_sales").select("*").eq("id", saleId).single(),
    rdb("retail_sale_items").select("*").eq("sale_id", saleId).order("product_name"),
    rdb("retail_sale_payments").select("*").eq("sale_id", saleId),
  ]);
  if (sale.error) throw sale.error;
  if (items.error) throw items.error;
  if (payments.error) throw payments.error;
  return {
    sale: normalizeSale(sale.data as RetailSale),
    items: ((items.data ?? []) as RetailSaleItem[]).map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total),
    })),
    payments: ((payments.data ?? []) as RetailSalePayment[]).map((p) => ({
      ...p,
      amount: Number(p.amount),
    })),
  };
}

export function useSaleDetail(saleId: string | null) {
  return useQuery({
    queryKey: ["retail-sale", saleId],
    enabled: !!saleId,
    queryFn: () => loadSaleDetail(saleId!),
  });
}

export type SalesFilter = {
  unitId: string;
  from: string;
  to: string;
  status: string;
  q: string;
  page: number;
};
export const SALES_PAGE = 50;

export function useSales(f: SalesFilter) {
  const { currentCompanyId } = useAuth();
  return useQuery({
    queryKey: ["retail-sales", currentCompanyId, f],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      let q = rdb("retail_sales")
        .select("*")
        .eq("company_id", currentCompanyId!)
        .order("created_at", { ascending: false })
        .range(f.page * SALES_PAGE, f.page * SALES_PAGE + SALES_PAGE);
      if (f.unitId !== "all") q = q.eq("unit_id", f.unitId);
      if (f.status !== "all") q = q.eq("status", f.status);
      if (f.from) q = q.gte("created_at", new Date(`${f.from}T00:00:00`).toISOString());
      if (f.to) q = q.lte("created_at", new Date(`${f.to}T23:59:59.999`).toISOString());
      const term = f.q.trim();
      if (term)
        q = q.or(
          `code.ilike.%${term.replace(/[%,()]/g, "")}%,customer_name.ilike.%${term.replace(/[%,()]/g, "")}%`,
        );
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as RetailSale[]).map(normalizeSale);
    },
  });
}

export function useCashSessions(unitId: string, page: number) {
  const { currentCompanyId } = useAuth();
  return useQuery({
    queryKey: ["retail-cash-sessions", currentCompanyId, unitId, page],
    enabled: !!currentCompanyId && !!unitId,
    queryFn: async () => {
      const { data, error } = await rdb("retail_cash_sessions")
        .select("*")
        .eq("unit_id", unitId)
        .order("opened_at", { ascending: false })
        .range(page * 30, page * 30 + 30);
      if (error) throw error;
      return ((data ?? []) as CashSession[]).map(normalizeSession);
    },
  });
}

export function useCashMovements(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ["retail-cash-movements", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await rdb("retail_cash_movements")
        .select("*")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as CashMovement[]).map((m) => ({ ...m, amount: Number(m.amount) }));
    },
  });
}
