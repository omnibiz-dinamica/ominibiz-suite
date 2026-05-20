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

// ---------- Advanced variables (namespaced + filters) ----------

export type NamespacedVars = Record<string, string | number | null | undefined>;

function applyFilter(value: string, filter: string): string {
  const f = filter.trim().toLowerCase();
  if (!value) return value;
  if (f === "uppercase") return value.toUpperCase();
  if (f === "lowercase") return value.toLowerCase();
  if (f === "currency") {
    const n = Number(value);
    return Number.isFinite(n) ? formatEUR(n) : value;
  }
  if (f === "date") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-PT");
  }
  return value;
}

/**
 * Render a template using namespaced vars like {{client.legal_name | uppercase}}.
 * Returns rendered text. Pending vars are kept as their raw {{...}} tokens.
 */
export function renderAdvanced(body: string, vars: NamespacedVars): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*([a-zA-Z_]+)\s*)?\}\}/g, (m, key: string, filter?: string) => {
    const raw = vars[key];
    if (raw === undefined || raw === null || raw === "") return m;
    const out = String(raw);
    return filter ? applyFilter(out, filter) : out;
  });
}

/** List of variable keys still pending after rendering (unique). */
export function listMissingVars(rendered: string): string[] {
  const out = new Set<string>();
  rendered.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|[^}]+)?\}\}/g, (_m, k: string) => {
    out.add(k);
    return "";
  });
  return Array.from(out);
}

/** Wrap pending vars with <mark> so the preview highlights them. */
export function highlightPending(rendered: string): string {
  return rendered.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|[^}]+)?\}\}/g, (m) =>
    `<mark class="bg-amber-200 text-amber-950 px-1 rounded">${m}</mark>`,
  );
}

export const BILLING_CYCLES = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  annual: "Anual",
} as const;

export const COMMERCIAL_STATUS_LABEL: Record<string, string> = {
  lead: "Lead",
  negotiation: "Em negociação",
  active: "Ativo",
  inactive: "Inativo",
};

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  signed: "Assinado",
  implementation: "Implementação",
  promo_period: "Período promo",
  active: "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};

export const CONTRACT_STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-600",
  signed: "bg-purple-500/15 text-purple-600",
  implementation: "bg-amber-500/15 text-amber-600",
  promo_period: "bg-teal-500/15 text-teal-600",
  active: "bg-emerald-500/15 text-emerald-600",
  suspended: "bg-orange-500/15 text-orange-600",
  cancelled: "bg-destructive/15 text-destructive",
};

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