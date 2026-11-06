import { describe, test, expect } from "bun:test";
import { computeCart, paymentMethodsFor, round2, RETAIL_OPERATOR_ROLES, RETAIL_ROLES } from "@/lib/retail";
import { buildReceiptHtml, receiptDisclaimer } from "@/lib/retail-receipt";
import { retailTabsFor } from "@/components/retail/RetailShell";
import { ROUTE_MODULES } from "@/lib/locale";

describe("Lojas · Etapa 2 · cálculo do carrinho (espelha retail_sale_create)", () => {
  test("subtotal, desconto, troco só sobre dinheiro", () => {
    const c = computeCart([{ quantity: 2, price: 10 }, { quantity: 4, price: 2.5 }], 3, [{ method: "dinheiro", amount: 50 }]);
    expect(c).toMatchObject({ subtotal: 30, discount: 3, total: 27, paid: 50, change: 23, ok: true });
  });
  test("arredonda por linha como o banco (0,1 + 0,2)", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(computeCart([{ quantity: 3, price: 0.1 }], 0, [{ method: "pix", amount: 0.3 }]).ok).toBe(true);
  });
  test("troco a partir de cartão é inválido", () => {
    const c = computeCart([{ quantity: 1, price: 10 }], 0, [{ method: "cartao_credito", amount: 20 }]);
    expect(c.ok).toBe(false);
    expect(c.problems.join(" ")).toContain("troco");
  });
  test("pagamento insuficiente e desconto maior que o subtotal são inválidos", () => {
    expect(computeCart([{ quantity: 1, price: 10 }], 0, [{ method: "pix", amount: 9.99 }]).ok).toBe(false);
    expect(computeCart([{ quantity: 1, price: 10 }], 11, [{ method: "dinheiro", amount: 0 }]).ok).toBe(false);
  });
  test("pagamento dividido com troco do dinheiro", () => {
    const c = computeCart([{ quantity: 1, price: 30 }], 0, [
      { method: "cartao_debito", amount: 20 },
      { method: "dinheiro", amount: 20 },
    ]);
    expect(c).toMatchObject({ total: 30, paid: 40, change: 10, ok: true });
  });
  test("carrinho vazio é inválido", () => {
    expect(computeCart([], 0, [{ method: "dinheiro", amount: 0 }]).ok).toBe(false);
  });
});

describe("Lojas · Etapa 2 · formas de pagamento por país", () => {
  test("Brasil tem PIX e não tem MB WAY; Portugal o contrário", () => {
    expect(paymentMethodsFor("BR")).toContain("pix");
    expect(paymentMethodsFor("BR")).not.toContain("mbway");
    expect(paymentMethodsFor("PT")).toContain("mbway");
    expect(paymentMethodsFor("PT")).toContain("multibanco");
    expect(paymentMethodsFor("PT")).not.toContain("pix");
  });
});

describe("Lojas · Etapa 2 · papéis e rotas", () => {
  test("funcionário opera PDV, Caixa e Vendas; gestão só para gestores", () => {
    expect(RETAIL_OPERATOR_ROLES).toContain("employee");
    expect(RETAIL_ROLES as readonly string[]).not.toContain("employee");
    expect(retailTabsFor("employee").map((t) => t.to)).toEqual(["/app/lojas/pdv", "/app/lojas/caixa", "/app/lojas/vendas"]);
    expect(retailTabsFor("manager").map((t) => t.to)).toContain("/app/lojas/estoque");
    expect(retailTabsFor("accountant").map((t) => t.to)).not.toContain("/app/lojas/estoque");
  });
  test("todas as rotas /app/lojas/* continuam protegidas por retail_core", () => {
    for (const p of ["/app/lojas/pdv", "/app/lojas/caixa", "/app/lojas/vendas"]) {
      const rule = ROUTE_MODULES.find((r) => p.startsWith(r.prefix));
      expect(rule?.module).toBe("retail_core");
    }
  });
});

describe("Lojas · Etapa 2 · comprovativo não fiscal", () => {
  const base = {
    sale: {
      code: "L1-2026-000001",
      created_at: "2026-11-06T18:00:00Z",
      subtotal: 30,
      discount: 3,
      total: 27,
      paid_total: 50,
      change_amount: 23,
      status: "concluida" as const,
      customer_name: "<script>alert(1)</script>",
      customer_tax_id: "123456789",
    },
    items: [{ product_name: "Azulejo & Moldura", product_unit: "un", quantity: 2, unit_price: 10, line_total: 20 }],
    payments: [{ method: "dinheiro" as const, amount: 50 }],
    store: { name: "Loja 1", tax_id: "500000000" },
    locale: "pt-PT",
    currency: "EUR",
  };
  test("Portugal: 'não serve de fatura' e NIF", () => {
    const html = buildReceiptHtml({ ...base, country: "PT" });
    expect(html).toContain(receiptDisclaimer("PT"));
    expect(receiptDisclaimer("PT")).toContain("não serve de fatura");
    expect(html).toContain("NIF");
    expect(html).toContain("Troco");
  });
  test("Brasil: 'sem valor fiscal' e CPF/CNPJ", () => {
    const html = buildReceiptHtml({ ...base, country: "BR", locale: "pt-BR", currency: "BRL" });
    expect(html).toContain("sem valor fiscal");
    expect(html).toContain("CPF/CNPJ");
  });
  test("escapa HTML de nomes (sem injeção na janela de impressão)", () => {
    const html = buildReceiptHtml({ ...base, country: "PT" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Azulejo &amp; Moldura");
  });
  test("venda cancelada aparece marcada", () => {
    const html = buildReceiptHtml({ ...base, sale: { ...base.sale, status: "cancelada" }, country: "PT" });
    expect(html).toContain("VENDA CANCELADA");
  });
});
