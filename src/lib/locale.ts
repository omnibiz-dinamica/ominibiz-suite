export type CountryCode = "PT" | "BR" | "ES";

export const COUNTRIES: { code: CountryCode; label: string; currency: string; language: string; timezone: string }[] = [
  { code: "PT", label: "Portugal", currency: "EUR", language: "pt-PT", timezone: "Europe/Lisbon" },
  { code: "BR", label: "Brasil", currency: "BRL", language: "pt-BR", timezone: "America/Sao_Paulo" },
  { code: "ES", label: "Espanha", currency: "EUR", language: "es-ES", timezone: "Europe/Madrid" },
];

export function countryDefaults(code: CountryCode) {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type BillingPlan = "starter" | "professional" | "business" | "enterprise";
export type BillingCycle = "monthly" | "annual";
export type BillingCountry = "PT" | "BE" | "ES" | "BR";

export type ModuleKey =
  | "core"
  | "tasks"
  | "time_clock"
  | "hr"
  | "crm"
  | "fleet"
  | "finance"
  | "support"
  | "whatsapp_ai"
  | "bi_advanced"
  | "ai_automations"
  | "notes"
  | "restaurant_dashboard"
  | "restaurant_menu"
  | "restaurant_tables"
  | "restaurant_orders"
  | "restaurant_kitchen"
  | "restaurant_delivery"
  | "restaurant_couriers"
  | "restaurant_delivery_zones";

/** ADR-027 — Ramo de atividade da empresa (business vertical). */
export type BusinessVertical = "cleaning_services" | "restaurant_delivery" | "generic";

export const BUSINESS_VERTICALS: { value: BusinessVertical; label: string }[] = [
  { value: "cleaning_services", label: "Serviços de Limpeza" },
  { value: "restaurant_delivery", label: "Restaurante & Delivery" },
  { value: "generic", label: "Genérico" },
];

export function normalizeBusinessVertical(value: string | null | undefined): BusinessVertical {
  return value === "restaurant_delivery" || value === "generic" ? value : "cleaning_services";
}

/** Módulos ativados automaticamente ao marcar a empresa como Restaurante & Delivery. */
export const RESTAURANT_ENABLED_MODULES: ModuleKey[] = [
  "core",
  "tasks",
  "time_clock",
  "hr",
  "finance",
  "support",
  "restaurant_dashboard",
  "restaurant_menu",
  "restaurant_tables",
  "restaurant_orders",
  "restaurant_kitchen",
  "restaurant_delivery",
  "restaurant_couriers",
  "restaurant_delivery_zones",
];

export type CompanyBilling = {
  billing_plan?: BillingPlan | null;
  billing_cycle?: BillingCycle | null;
  billing_country?: BillingCountry | string | null;
  billing_currency?: string | null;
  enabled_modules?: ModuleKey[] | string[] | null;
  employee_limit?: number | null;
  user_limit?: number | null;
};

export const PLAN_OPTIONS: Record<
  BillingPlan,
  { label: string; employeeLimit: number | null; userLimit: number | null; support: string }
> = {
  starter: { label: "Starter", employeeLimit: 5, userLimit: 1, support: "Email" },
  professional: { label: "Professional", employeeLimit: 20, userLimit: 5, support: "Prioritario" },
  business: { label: "Business", employeeLimit: 75, userLimit: 20, support: "Prioritario" },
  enterprise: { label: "Enterprise", employeeLimit: null, userLimit: null, support: "Dedicado" },
};

export const PLAN_PRICES: Record<BillingCountry, Record<BillingPlan, number>> = {
  PT: { starter: 29, professional: 59, business: 99, enterprise: 199 },
  BE: { starter: 29, professional: 59, business: 99, enterprise: 199 },
  ES: { starter: 29, professional: 59, business: 99, enterprise: 199 },
  BR: { starter: 99, professional: 179, business: 299, enterprise: 599 },
};

export const COUNTRY_CURRENCY: Record<BillingCountry, string> = {
  PT: "EUR",
  BE: "EUR",
  ES: "EUR",
  BR: "BRL",
};

export const MODULE_CATALOG: Record<
  ModuleKey,
  { label: string; description: string; addonMonthly: number; included: boolean }
> = {
  core: {
    label: "Base OmniBiz",
    description: "Dashboard, empresa, notificacoes e perfil.",
    addonMonthly: 0,
    included: true,
  },
  tasks: {
    label: "Planeamento e tarefas",
    description: "Tarefas, calendario, recorrencias e planeamento operacional.",
    addonMonthly: 0,
    included: true,
  },
  time_clock: {
    label: "Folha de ponto",
    description: "Registo de ponto, gestao e validacoes operacionais.",
    addonMonthly: 0,
    included: true,
  },
  hr: {
    label: "RH",
    description: "Funcionarios, ferias/ausencias e recibos.",
    addonMonthly: 0,
    included: true,
  },
  support: {
    label: "Central de suporte",
    description: "Tickets de suporte por empresa.",
    addonMonthly: 0,
    included: true,
  },
  crm: {
    label: "CRM / Comercial",
    description: "Clientes, contratos e gestao comercial.",
    addonMonthly: 15,
    included: false,
  },
  fleet: {
    label: "Frota",
    description: "Gestao de veiculos e cartoes.",
    addonMonthly: 20,
    included: false,
  },
  finance: {
    label: "Financeiro",
    description: "Despesas e controlo financeiro operacional.",
    addonMonthly: 20,
    included: false,
  },
  whatsapp_ai: {
    label: "WhatsApp com IA",
    description: "Atendimento e automacoes por WhatsApp com IA.",
    addonMonthly: 39,
    included: false,
  },
  bi_advanced: {
    label: "BI e dashboards avancados",
    description: "Relatorios completos e indicadores avancados.",
    addonMonthly: 25,
    included: false,
  },
  ai_automations: {
    label: "Automacoes com IA",
    description: "Fluxos inteligentes e automacoes conectadas.",
    addonMonthly: 49,
    included: false,
  },
  notes: {
    label: "Notas",
    description: "Notas internas e documentacao simples.",
    addonMonthly: 0,
    included: false,
  },
};

const RESTAURANT_MODULE_META: Record<string, { label: string; description: string }> = {
  restaurant_dashboard: { label: "Restaurante · Dashboard", description: "Visao geral da operacao do restaurante." },
  restaurant_menu: { label: "Restaurante · Menu", description: "Cardapio, categorias e itens." },
  restaurant_tables: { label: "Restaurante · Mesas", description: "Gestao de mesas e salas." },
  restaurant_orders: { label: "Restaurante · Pedidos", description: "Pedidos de balcao, mesa e delivery." },
  restaurant_kitchen: { label: "Restaurante · Cozinha", description: "Painel de producao da cozinha." },
  restaurant_delivery: { label: "Restaurante · Delivery", description: "Entregas e acompanhamento." },
  restaurant_couriers: { label: "Restaurante · Entregadores", description: "Gestao de entregadores." },
  restaurant_delivery_zones: { label: "Restaurante · Zonas de Entrega", description: "Zonas, raios e taxas." },
};

for (const [key, meta] of Object.entries(RESTAURANT_MODULE_META)) {
  MODULE_CATALOG[key as ModuleKey] = { ...meta, addonMonthly: 0, included: false };
}

export const DEFAULT_ENABLED_MODULES: ModuleKey[] = [
  "core",
  "tasks",
  "time_clock",
  "hr",
  "support",
  "crm",
  "fleet",
  "finance",
];

export const ROUTE_MODULES: Array<{ prefix: string; module: ModuleKey }> = [
  { prefix: "/app/tarefas", module: "tasks" },
  { prefix: "/app/ponto", module: "time_clock" },
  { prefix: "/app/rh", module: "hr" },
  { prefix: "/app/equipe", module: "hr" },
  { prefix: "/app/ferias", module: "hr" },
  { prefix: "/app/meus-recibos", module: "hr" },
  { prefix: "/app/despesas", module: "finance" },
  { prefix: "/app/clientes", module: "crm" },
  { prefix: "/app/comercial", module: "crm" },
  { prefix: "/app/frota", module: "fleet" },
  { prefix: "/app/assistente", module: "whatsapp_ai" },
  { prefix: "/app/notas", module: "notes" },
  { prefix: "/app/suporte", module: "support" },
];

export function normalizeBillingCountry(country: string | null | undefined): BillingCountry {
  if (country === "BR" || country === "BE" || country === "ES") return country;
  return "PT";
}

export function normalizeModules(modules: CompanyBilling["enabled_modules"]): ModuleKey[] {
  const values = Array.isArray(modules) && modules.length > 0 ? modules : DEFAULT_ENABLED_MODULES;
  return Array.from(
    new Set(values.filter((m): m is ModuleKey => Object.prototype.hasOwnProperty.call(MODULE_CATALOG, m))),
  );
}

export function isModuleEnabled(modules: CompanyBilling["enabled_modules"], module: ModuleKey): boolean {
  return normalizeModules(modules).includes(module);
}

export function moduleForPath(path: string): ModuleKey | null {
  const match = ROUTE_MODULES.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`));
  return match?.module ?? null;
}

export function planMonthlyPrice(plan: BillingPlan, country: string | null | undefined): number {
  return PLAN_PRICES[normalizeBillingCountry(country)][plan];
}

export function moduleAddonsMonthly(modules: CompanyBilling["enabled_modules"]): number {
  return normalizeModules(modules).reduce((total, module) => total + MODULE_CATALOG[module].addonMonthly, 0);
}

export function billingMonthlyTotal(company: CompanyBilling): number {
  const plan = company.billing_plan ?? "professional";
  return planMonthlyPrice(plan, company.billing_country) + moduleAddonsMonthly(company.enabled_modules);
}

export function billingAnnualTotal(company: CompanyBilling): number {
  return billingMonthlyTotal(company) * 10;
}

export function formatBillingAmount(value: number, currency: string | null | undefined): string {
  const resolved = currency || "EUR";
  return new Intl.NumberFormat(resolved === "BRL" ? "pt-BR" : "pt-PT", {
    style: "currency",
    currency: resolved,
    maximumFractionDigits: 0,
  }).format(value);
}
