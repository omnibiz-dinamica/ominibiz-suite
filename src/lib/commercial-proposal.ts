/**
 * Proposta Comercial OmniBiz — gerador de documento para impressão/PDF.
 *
 * Usa exclusivamente os dados já configurados no Super Admin (plano, módulos,
 * desconto e implantação). Não altera regras de faturação nem persiste nada.
 */
import {
  MODULE_CATALOG,
  PLAN_OPTIONS,
  billingDiscountAmount,
  billingMonthlySubtotal,
  billingMonthlyTotal,
  billingAnnualTotal,
  billingSetupInstallments,
  formatBillingAmount,
  moduleAddonsMonthly,
  normalizeModules,
  planMonthlyPrice,
  planSetupFee,
  type BillingCycle,
  type BillingDiscountKind,
  type BillingPlan,
  type ModuleKey,
} from "@/lib/locale";

export type ProposalInput = {
  companyName: string;
  companySlug?: string | null;
  plan: BillingPlan;
  cycle: BillingCycle;
  country: "PT" | "BE" | "ES" | "BR";
  currency: string;
  modules: ModuleKey[];
  discountKind: BillingDiscountKind;
  discountValue: number;
  notes?: string | null;
  /** Validade da proposta em dias (padrão 15). */
  validityDays?: number;
};

const COUNTRY_LABEL: Record<ProposalInput["country"], string> = {
  PT: "Portugal",
  BE: "Bélgica",
  ES: "Espanha",
  BR: "Brasil",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function proposalReference(input: ProposalInput, issuedAt: Date): string {
  const base = (input.companySlug || input.companyName || "omnibiz")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
  const y = issuedAt.getFullYear();
  const m = String(issuedAt.getMonth() + 1).padStart(2, "0");
  const d = String(issuedAt.getDate()).padStart(2, "0");
  return `PROP-${y}${m}${d}-${base || "OMNI"}`;
}

export function buildProposalHtml(input: ProposalInput, issuedAt: Date = new Date()): string {
  const modules = normalizeModules(input.modules);
  const billing = {
    billing_plan: input.plan,
    billing_cycle: input.cycle,
    billing_country: input.country,
    billing_currency: input.currency,
    enabled_modules: modules,
    billing_discount_kind: input.discountKind,
    billing_discount_value: input.discountValue,
  };

  const planInfo = PLAN_OPTIONS[input.plan];
  const base = planMonthlyPrice(input.plan, input.country);
  const addons = moduleAddonsMonthly(modules);
  const subtotal = billingMonthlySubtotal(billing);
  const discount = billingDiscountAmount(billing);
  const monthly = billingMonthlyTotal(billing);
  const annual = billingAnnualTotal(billing);
  const setupFee = planSetupFee(input.plan, input.country);
  const setup = billingSetupInstallments(setupFee);

  const includedModules = modules.filter((m) => MODULE_CATALOG[m].included || MODULE_CATALOG[m].addonMonthly === 0);
  const addonModules = modules.filter((m) => !MODULE_CATALOG[m].included && MODULE_CATALOG[m].addonMonthly > 0);

  const validityDays = input.validityDays ?? 15;
  const validUntil = new Date(issuedAt.getTime());
  validUntil.setDate(validUntil.getDate() + validityDays);

  const money = (v: number) => escapeHtml(formatBillingAmount(v, input.currency));

  const includedRows = includedModules
    .map(
      (m) => `<tr>
        <td><strong>${escapeHtml(MODULE_CATALOG[m].label)}</strong><span class="desc">${escapeHtml(MODULE_CATALOG[m].description)}</span></td>
        <td class="right included">Incluído</td>
      </tr>`,
    )
    .join("");

  const addonRows = addonModules.length
    ? addonModules
        .map(
          (m) => `<tr>
        <td><strong>${escapeHtml(MODULE_CATALOG[m].label)}</strong><span class="desc">${escapeHtml(MODULE_CATALOG[m].description)}</span></td>
        <td class="right">${money(MODULE_CATALOG[m].addonMonthly)}/mês</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="2" class="muted">Sem módulos adicionais contratados nesta proposta.</td></tr>`;

  const discountLabel =
    input.discountKind === "percent"
      ? `Desconto comercial (${escapeHtml(String(input.discountValue))}%)`
      : "Desconto comercial";

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>Proposta Comercial — ${escapeHtml(input.companyName)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #10182a; font-size: 11.5px; line-height: 1.5;
    background: #fff;
  }
  .sheet { max-width: 190mm; margin: 0 auto; padding: 4mm 0 0; }
  header.doc {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #0f4c81; padding-bottom: 10px; margin-bottom: 16px;
  }
  .brand { font-size: 20px; font-weight: 800; color: #0f4c81; letter-spacing: -0.3px; }
  .brand small { display: block; font-size: 10.5px; font-weight: 500; color: #5b6880; letter-spacing: 0.4px; }
  .meta { text-align: right; font-size: 10.5px; color: #5b6880; }
  .meta strong { color: #10182a; }
  h1 { font-size: 16px; margin: 0 0 4px; color: #10182a; }
  h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px;
    color: #0f4c81; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #dde3ec;
  }
  p { margin: 0 0 8px; }
  .cards { display: flex; gap: 10px; }
  .card { flex: 1; border: 1px solid #dde3ec; border-radius: 6px; padding: 9px 11px; }
  .card .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #5b6880; }
  .card .v { font-size: 13px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e6ebf2; vertical-align: top; }
  th { background: #f3f6fa; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #5b6880; }
  td .desc { display: block; font-size: 10px; color: #5b6880; margin-top: 1px; }
  .right { text-align: right; white-space: nowrap; }
  .included { color: #1c7a4a; font-weight: 600; }
  .muted { color: #5b6880; font-style: italic; }
  tr.total td { border-top: 2px solid #0f4c81; border-bottom: none; font-size: 13px; font-weight: 800; padding-top: 8px; }
  tr.discount td { color: #1c7a4a; }
  .callout { background: #f3f6fa; border-left: 3px solid #0f4c81; border-radius: 4px; padding: 9px 11px; }
  ul { margin: 0; padding-left: 16px; }
  li { margin-bottom: 3px; }
  .sign { display: flex; gap: 24px; margin-top: 26px; }
  .sign div { flex: 1; border-top: 1px solid #10182a; padding-top: 6px; font-size: 10px; color: #5b6880; }
  footer.doc { margin-top: 18px; border-top: 1px solid #dde3ec; padding-top: 8px; font-size: 9.5px; color: #5b6880; text-align: center; }
  .avoid-break { page-break-inside: avoid; }
  h2 { page-break-after: avoid; break-after: avoid; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }

  @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="sheet">
  <header class="doc">
    <div>
      <div class="brand">OmniBiz Suite<small>Gestão operacional para equipas de serviços</small></div>
    </div>
    <div class="meta">
      <div><strong>${escapeHtml(proposalReference(input, issuedAt))}</strong></div>
      <div>Emissão: ${escapeHtml(formatDate(issuedAt))}</div>
      <div>Validade: ${escapeHtml(formatDate(validUntil))} (${validityDays} dias)</div>
    </div>
  </header>

  <h1>Proposta Comercial</h1>
  <p>Proposta de licenciamento e implantação da plataforma OmniBiz Suite, preparada para <strong>${escapeHtml(input.companyName)}</strong>.</p>

  <h2>Cliente</h2>
  <div class="cards avoid-break">
    <div class="card"><div class="k">Empresa</div><div class="v">${escapeHtml(input.companyName)}</div></div>
    <div class="card"><div class="k">País</div><div class="v">${escapeHtml(COUNTRY_LABEL[input.country])}</div></div>
    <div class="card"><div class="k">Moeda</div><div class="v">${escapeHtml(input.currency)}</div></div>
  </div>

  <h2>Plano contratado</h2>
  <div class="cards avoid-break">
    <div class="card"><div class="k">Plano</div><div class="v">${escapeHtml(planInfo.label)}</div></div>
    <div class="card"><div class="k">Funcionários</div><div class="v">${planInfo.employeeLimit === null ? "Ilimitados" : `Até ${planInfo.employeeLimit}`}</div></div>
    <div class="card"><div class="k">Utilizadores</div><div class="v">${planInfo.userLimit === null ? "Ilimitados" : `Até ${planInfo.userLimit}`}</div></div>
    <div class="card"><div class="k">Suporte</div><div class="v">${escapeHtml(planInfo.support)}</div></div>
  </div>

  <h2>Módulos incluídos no plano</h2>
  <table class="avoid-break">
    <thead><tr><th>Módulo</th><th class="right">Valor</th></tr></thead>
    <tbody>${includedRows}</tbody>
  </table>

  <h2>Módulos adicionais</h2>
  <table class="avoid-break">
    <thead><tr><th>Módulo</th><th class="right">Valor mensal</th></tr></thead>
    <tbody>${addonRows}</tbody>
  </table>

  <h2>Condições financeiras</h2>
  <table class="avoid-break">
    <tbody>
      <tr><td>Plano ${escapeHtml(planInfo.label)}</td><td class="right">${money(base)}/mês</td></tr>
      <tr><td>Módulos adicionais</td><td class="right">${money(addons)}/mês</td></tr>
      <tr><td>Subtotal mensal</td><td class="right">${money(subtotal)}/mês</td></tr>
      ${discount > 0 ? `<tr class="discount"><td>${discountLabel}</td><td class="right">− ${money(discount)}</td></tr>` : ""}
      <tr class="total"><td>Mensalidade final</td><td class="right">${money(monthly)}/mês</td></tr>
    </tbody>
  </table>
  ${input.cycle === "annual" ? `<p class="muted">Ciclo de faturação anual: ${money(annual)}/ano.</p>` : ""}

  <h2>Implantação e arranque</h2>
  <table class="avoid-break">
    <tbody>
      <tr><td>Implantação, configuração e formação inicial</td><td class="right">${money(setupFee)}</td></tr>
      <tr><td>1.ª prestação — na assinatura</td><td class="right">${money(setup.first)}</td></tr>
      <tr><td>2.ª prestação — 15 dias após a assinatura</td><td class="right">${money(setup.second)}</td></tr>
      <tr class="total"><td>Primeiro pagamento (entrada + 1.º mês)</td><td class="right">${money(setup.first + monthly)}</td></tr>
    </tbody>
  </table>
  <p class="muted">O valor de implantação é único e não é objeto de desconto.</p>

  <h2>Condições gerais</h2>
  <div class="callout avoid-break">
    <ul>
      <li>Mensalidade cobrada por ciclo ${input.cycle === "annual" ? "anual" : "mensal"}, com início após a assinatura.</li>
      <li>Implantação paga em duas prestações: entrada na assinatura e o remanescente 15 dias depois.</li>
      <li>Atualizações da plataforma, alojamento seguro e cópias de segurança incluídos na mensalidade.</li>
      <li>Suporte ${escapeHtml(planInfo.support.toLowerCase())} em horário útil, por canal digital.</li>
      <li>Limites de funcionários e utilizadores conforme o plano; excedentes implicam mudança de plano.</li>
      <li>Módulos adicionais podem ser ativados a qualquer momento, com efeito na mensalidade seguinte.</li>
      <li>Proposta válida por ${validityDays} dias a contar da data de emissão.</li>
    </ul>
  </div>

  ${input.notes && input.notes.trim() ? `<h2>Notas</h2><p>${escapeHtml(input.notes.trim())}</p>` : ""}

  <h2>Aceitação</h2>
  <div class="sign avoid-break">
    <div>OmniBiz Suite — Representante comercial<br />Data: ____ / ____ / ________</div>
    <div>${escapeHtml(input.companyName)} — Representante legal<br />Data: ____ / ____ / ________</div>
  </div>

  <footer class="doc">OmniBiz Suite · Proposta ${escapeHtml(proposalReference(input, issuedAt))} · Documento gerado automaticamente pelo sistema</footer>
</div>
</body>
</html>`;
}

/** Abre o documento numa nova janela e dispara a impressão (ou gravação em PDF). */
export function printProposal(html: string): boolean {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
  return true;
}
