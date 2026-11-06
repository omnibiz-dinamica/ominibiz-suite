/**
 * Comprovativo de venda NÃO fiscal (cupom 80 mm) — Lojas · Etapa 2.
 * Não substitui fatura (PT) nem NFC-e (BR): a emissão fiscal virá por integração
 * com software certificado (Etapa 5). Abre uma janela e chama print(), como a
 * proposta comercial (src/lib/commercial-proposal.ts).
 */
import {
  PAYMENT_LABEL,
  type RetailSale,
  type RetailSaleItem,
  type RetailSalePayment,
} from "@/lib/retail";

export type ReceiptInput = {
  sale: Pick<
    RetailSale,
    | "code"
    | "created_at"
    | "subtotal"
    | "discount"
    | "total"
    | "paid_total"
    | "change_amount"
    | "status"
    | "customer_name"
    | "customer_tax_id"
  >;
  items: Pick<
    RetailSaleItem,
    "product_name" | "product_unit" | "quantity" | "unit_price" | "line_total"
  >[];
  payments: Pick<RetailSalePayment, "method" | "amount">[];
  store: {
    name: string;
    legal_name?: string | null;
    tax_id?: string | null;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
  };
  sellerName?: string | null;
  country: string;
  locale: string;
  currency: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function receiptDisclaimer(country: string): string {
  return country === "BR"
    ? "Documento sem valor fiscal. Não substitui a NFC-e."
    : "Este documento não serve de fatura.";
}

/** HTML completo do comprovativo (puro, testável). */
export function buildReceiptHtml(input: ReceiptInput): string {
  const { sale, items, payments, store, country, locale, currency } = input;
  const money = (v: number) =>
    escapeHtml(new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(v)));
  const qty = (v: number) =>
    escapeHtml(new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(Number(v)));
  const when = escapeHtml(
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
      new Date(sale.created_at),
    ),
  );
  const taxLabel = country === "BR" ? "CPF/CNPJ" : "NIF";
  const rows = items
    .map(
      (i) => `<tr><td colspan="2">${escapeHtml(i.product_name)}</td></tr>
      <tr class="sub"><td>${qty(i.quantity)} ${escapeHtml(i.product_unit)} × ${money(i.unit_price)}</td><td class="r">${money(i.line_total)}</td></tr>`,
    )
    .join("");
  const pays = payments
    .map(
      (p) =>
        `<tr><td>${escapeHtml(PAYMENT_LABEL[p.method] ?? p.method)}</td><td class="r">${money(p.amount)}</td></tr>`,
    )
    .join("");
  const storeLines = [
    store.legal_name,
    store.tax_id ? `${taxLabel} ${store.tax_id}` : null,
    store.address,
    store.city,
    store.phone,
  ]
    .filter(Boolean)
    .map((l) => `<div>${escapeHtml(String(l))}</div>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sale.code)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 80mm; margin: 0; padding: 4mm; font: 12px/1.35 ui-monospace, Menlo, Consolas, monospace; color: #000; }
  h1 { font-size: 14px; margin: 0 0 2px; text-align: center; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  tr.sub td { padding-bottom: 3px; color: #333; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .tot td { font-weight: 700; font-size: 13px; }
  .void { text-align: center; font-weight: 700; border: 1px solid #000; padding: 2px; margin: 4px 0; }
  .no-print { margin-top: 8px; text-align: center; }
  @media print { .no-print { display: none; } }
</style></head><body>
  <h1>${escapeHtml(store.name)}</h1>
  <div class="c">${storeLines}</div>
  <hr>
  <div>Venda: <strong>${escapeHtml(sale.code)}</strong></div>
  <div>Data: ${when}</div>
  ${input.sellerName ? `<div>Atendido por: ${escapeHtml(input.sellerName)}</div>` : ""}
  ${sale.customer_name ? `<div>Cliente: ${escapeHtml(sale.customer_name)}</div>` : ""}
  ${sale.customer_tax_id ? `<div>${taxLabel}: ${escapeHtml(sale.customer_tax_id)}</div>` : ""}
  ${sale.status === "cancelada" ? `<div class="void">VENDA CANCELADA</div>` : ""}
  <hr>
  <table>${rows}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${money(sale.subtotal)}</td></tr>
    ${Number(sale.discount) > 0 ? `<tr><td>Desconto</td><td class="r">- ${money(sale.discount)}</td></tr>` : ""}
    <tr class="tot"><td>TOTAL</td><td class="r">${money(sale.total)}</td></tr>
  </table>
  <hr>
  <table>${pays}
    ${Number(sale.change_amount) > 0 ? `<tr><td>Troco</td><td class="r">${money(sale.change_amount)}</td></tr>` : ""}
  </table>
  <hr>
  <div class="c">${escapeHtml(receiptDisclaimer(country))}</div>
  <div class="c">Obrigado pela preferência!</div>
  <div class="no-print"><button onclick="window.print()">Imprimir</button></div>
</body></html>`;
}

/** Abre o comprovativo numa janela e imprime. Devolve false se o browser bloquear o popup. */
export function printReceipt(input: ReceiptInput): boolean {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return false;
  win.document.open();
  win.document.write(buildReceiptHtml(input));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
  return true;
}
