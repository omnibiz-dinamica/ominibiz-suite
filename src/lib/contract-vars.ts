export type ContractVars = {
  company_name: string;
  nif: string;
  plan_name: string;
  monthly_fee: string;
  credits_limit: string;
  services: string;
  start_date?: string;
  promo_months?: string;
  promo_fee?: string;
};

export function formatEUR(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    Number.isFinite(v) ? v : 0,
  );
}

export const SERVICE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  website: "Website",
  dashboard: "Dashboard",
  ai_support: "AI Support",
  reports: "Reports",
  scheduling: "Scheduling",
};

export function renderTemplate(body: string, vars: Partial<ContractVars>): string {
  return body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, key: string) => {
    const v = (vars as Record<string, string | undefined>)[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

export const DEFAULT_TEMPLATE_BODY = `# Contrato de Prestação de Serviços

**Cliente:** {{company_name}}
**NIF:** {{nif}}

## Plano contratado

Plano **{{plan_name}}** com mensalidade de **{{monthly_fee}}** e limite de **{{credits_limit}}** créditos de IA por mês.

## Serviços incluídos

{{services}}

## Início de vigência

{{start_date}}

## Período promocional

Os primeiros {{promo_months}} meses serão cobrados ao valor promocional de {{promo_fee}}.

---

Ao assinar este contrato, o cliente declara ter lido e aceite todas as condições previstas no presente documento.`;