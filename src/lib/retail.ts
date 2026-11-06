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
  if (e.code === "23503" && /retail_stock_(movements|balances)/.test(e.message ?? ""))
    return "Este registo tem histórico de estoque e não pode ser excluído. Desative-o.";
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
