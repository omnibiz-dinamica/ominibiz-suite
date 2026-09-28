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
  | "restaurant_delivery_zones"
  // ADR-033 — Vertical Material de Construção (inativo por omissão).
  | "building_materials_dashboard"
  | "building_materials_products"
  | "building_materials_inventory"
  | "building_materials_categories"
  | "building_materials_suppliers"
  | "building_materials_purchases"
  | "building_materials_quotes"
  | "building_materials_sales"
  | "building_materials_customers"
  | "building_materials_deliveries"
  | "building_materials_finance";

/** ADR-027 / ADR-033 — Ramo de atividade da empresa (business vertical). */
export type BusinessVertical =
  | "cleaning_services"
  | "restaurant_delivery"
  | "building_materials"
  | "hospitality"
  | "auto_repair"
  | "generic";

/** De momento apenas Limpeza está disponível (decisão 2026-09-28). */
export const BUSINESS_VERTICALS: { value: BusinessVertical; label: string }[] = [
  { value: "cleaning_services", label: "Serviços de Limpeza" },
];

const KNOWN_VERTICALS: BusinessVertical[] = [
  "cleaning_services",
  "restaurant_delivery",
  "building_materials",
  "hospitality",
  "auto_repair",
  "generic",
];

export function normalizeBusinessVertical(value: string | null | undefined): BusinessVertical {
  return KNOWN_VERTICALS.includes(value as BusinessVertical) ? (value as BusinessVertical) : "cleaning_services";
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

/** Desconto aplicado apenas à mensalidade (decisão 2026-09-28). */
export type BillingDiscountKind = "none" | "percent" | "amount";

export type CompanyBilling = {
  billing_plan?: BillingPlan | null;
  billing_cycle?: BillingCycle | null;
  billing_country?: BillingCountry | string | null;
  billing_currency?: string | null;
  enabled_modules?: ModuleKey[] | string[] | null;
  employee_limit?: number | null;
  user_limit?: number | null;
  billing_discount_kind?: BillingDiscountKind | string | null;
  billing_discount_value?: number | null;
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

/**
 * Tabela comercial 2026-09-28 — países europeus atualizados.
 * Brasil mantém os valores atuais por decisão do Super Admin.
 */
export const PLAN_PRICES: Record<BillingCountry, Record<BillingPlan, number>> = {
  PT: { starter: 80, professional: 115, business: 150, enterprise: 185 },
  BE: { starter: 80, professional: 115, business: 150, enterprise: 185 },
  ES: { starter: 80, professional: 115, business: 150, enterprise: 185 },
  BR: { starter: 99, professional: 179, business: 299, enterprise: 599 },
};

/** Implantação (pagamento único) = 2x a mensalidade do plano. */
export const PLAN_SETUP_PRICES: Record<BillingCountry, Record<BillingPlan, number>> = {
  PT: { starter: 160, professional: 230, business: 300, enterprise: 370 },
  BE: { starter: 160, professional: 230, business: 300, enterprise: 370 },
  ES: { starter: 160, professional: 230, business: 300, enterprise: 370 },
  BR: { starter: 198, professional: 358, business: 598, enterprise: 1198 },
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
    description: "Dashboard, empresa, notificações e perfil.",
    addonMonthly: 0,
    included: true,
  },
  tasks: {
    label: "Planeamento e tarefas",
    description: "Clientes, tarefas, calendário, recorrências e planeamento operacional.",
    addonMonthly: 0,
    included: true,
  },
  time_clock: {
    label: "Folha de ponto",
    description: "Registo de ponto, gestão e validações operacionais.",
    addonMonthly: 0,
    included: true,
  },
  hr: {
    label: "RH",
    description: "Funcionários, férias/ausências e recibos.",
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
    description: "Contratos e gestão comercial: faturas, compras, vendas e estoque.",
    addonMonthly: 24,
    included: false,
  },
  fleet: {
    label: "Frota",
    description: "Gestão de veículos e cartões.",
    addonMonthly: 19,
    included: false,
  },
  finance: {
    label: "Financeiro operacional",
    description: "Despesas da equipa. Sem custo adicional.",
    addonMonthly: 0,
    included: false,
  },
  whatsapp_ai: {
    label: "WhatsApp com IA",
    description: "Atendimento e automações por WhatsApp com IA.",
    addonMonthly: 49,
    included: false,
  },
  bi_advanced: {
    label: "BI e dashboards avançados",
    description: "Relatórios completos e indicadores avançados.",
    addonMonthly: 24,
    included: false,
  },
  ai_automations: {
    label: "Automações com IA",
    description: "Fluxos inteligentes e automações conectadas.",
    addonMonthly: 49,
    included: false,
  },
  notes: {
    label: "Notas",
    description: "Notas internas e documentação simples.",
    addonMonthly: 0,
    included: true,
  },
  restaurant_dashboard: {
    label: "Restaurante · Dashboard",
    description: "Visao geral da operacao do restaurante.",
    addonMonthly: 0,
    included: false,
  },
  restaurant_menu: {
    label: "Restaurante · Menu",
    description: "Cardapio, categorias e itens.",
    addonMonthly: 0,
    included: false,
  },
  restaurant_tables: {
    label: "Restaurante · Mesas",
    description: "Gestao de mesas e salas.",
    addonMonthly: 0,
    included: false,
  },
  restaurant_orders: {
    label: "Restaurante · Pedidos",
    description: "Pedidos de balcao, mesa e delivery.",
    addonMonthly: 0,
    included: false,
  },
  restaurant_kitchen: {
    label: "Restaurante · Cozinha",
    description: "Painel de producao da cozinha.",
    addonMonthly: 0,
    included: false,
  },
  restaurant_delivery: {
    label: "Restaurante · Delivery",
    description: "Entregas e acompanhamento.",
    addonMonthly: 0,
    included: false,
  },
  restaurant_couriers: {
    label: "Restaurante · Entregadores",
    description: "Gestao de entregadores.",
    addonMonthly: 0,
    included: false,
  },
  restaurant_delivery_zones: {
    label: "Restaurante · Zonas de Entrega",
    description: "Zonas, raios e taxas.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_dashboard: {
    label: "Material · Visão Geral",
    description: "Indicadores da operação de material de construção.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_products: {
    label: "Material · Produtos",
    description: "Catálogo de produtos e unidades.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_inventory: {
    label: "Material · Estoque",
    description: "Saldos, entradas e saídas de estoque.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_categories: {
    label: "Material · Categorias",
    description: "Categorias e famílias de produtos.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_suppliers: {
    label: "Material · Fornecedores",
    description: "Cadastro de fornecedores.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_purchases: {
    label: "Material · Compras",
    description: "Pedidos de compra e recebimentos.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_quotes: {
    label: "Material · Orçamentos",
    description: "Orçamentos e propostas de venda.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_sales: {
    label: "Material · Vendas / PDV",
    description: "Vendas de balcão e ponto de venda.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_customers: {
    label: "Material · Clientes",
    description: "Clientes do balcão e obra.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_deliveries: {
    label: "Material · Entregas",
    description: "Entregas, rotas e comprovativos.",
    addonMonthly: 0,
    included: false,
  },
  building_materials_finance: {
    label: "Material · Financeiro",
    description: "Contas a receber e a pagar do vertical.",
    addonMonthly: 0,
    included: false,
  },
};


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

/**
 * ADR-047 (SUP-2026-000075) — Módulos essenciais (`included: true` no catálogo).
 *
 * Estão incluídos no plano e NÃO podem ser desativados. Se o array
 * `companies.enabled_modules` for gravado sem eles (empresas antigas ou
 * atualizações parciais), o menu do Gestor perdia itens em silêncio
 * (ex.: "Tarefas" desaparecia) e o Super Admin não conseguia reativá-los
 * porque o toggle ignora módulos incluídos. A normalização passa a garantir
 * sempre este piso mínimo.
 */
export const ESSENTIAL_MODULES: ModuleKey[] = (
  Object.keys(MODULE_CATALOG) as ModuleKey[]
).filter((m) => MODULE_CATALOG[m].included);


/**
 * ADR-033 — Módulos do vertical Material de Construção.
 * IMPORTANTE: nunca são incluídos em DEFAULT_ENABLED_MODULES nem ativados
 * automaticamente. Só o Super Admin os ativa, empresa a empresa.
 */
export const BUILDING_MATERIALS_MODULES: ModuleKey[] = [
  "building_materials_dashboard",
  "building_materials_products",
  "building_materials_inventory",
  "building_materials_categories",
  "building_materials_suppliers",
  "building_materials_purchases",
  "building_materials_quotes",
  "building_materials_sales",
  "building_materials_customers",
  "building_materials_deliveries",
  "building_materials_finance",
];

/** Rota → módulo exigido pelo ModuleGuard no vertical Material de Construção. */
export const BUILDING_MATERIALS_ROUTE_MODULES: Array<{ prefix: string; module: ModuleKey }> = [
  { prefix: "/app/material-construcao/produtos", module: "building_materials_products" },
  { prefix: "/app/material-construcao/estoque", module: "building_materials_inventory" },
  { prefix: "/app/material-construcao/categorias", module: "building_materials_categories" },
  { prefix: "/app/material-construcao/fornecedores", module: "building_materials_suppliers" },
  { prefix: "/app/material-construcao/compras", module: "building_materials_purchases" },
  { prefix: "/app/material-construcao/orcamentos", module: "building_materials_quotes" },
  { prefix: "/app/material-construcao/vendas", module: "building_materials_sales" },
  { prefix: "/app/material-construcao/clientes", module: "building_materials_customers" },
  { prefix: "/app/material-construcao/entregas", module: "building_materials_deliveries" },
  { prefix: "/app/material-construcao/financeiro", module: "building_materials_finance" },
  { prefix: "/app/material-construcao", module: "building_materials_dashboard" },
];

/** ADR-028 / ADR-033 — agrupamento dos módulos por aba na configuração da empresa (UI). */
export type ModuleTabKey =
  | "general"
  | "cleaning"
  | "restaurant"
  | "building_materials"
  | "hospitality"
  | "auto_repair";

export const MODULE_TABS: Array<{
  key: ModuleTabKey;
  label: string;
  vertical: BusinessVertical | null;
  modules: ModuleKey[];
}> = [
  {
    key: "general",
    label: "Geral",
    vertical: null,
    modules: [
      "core",
      "tasks",
      "time_clock",
      "hr",
      "support",
      "finance",
      "crm",
      "fleet",
      "whatsapp_ai",
      "bi_advanced",
      "ai_automations",
      "notes",
    ],
  },
  {
    key: "cleaning",
    label: "Limpeza",
    vertical: "cleaning_services",
    modules: ["tasks", "crm", "time_clock", "fleet"],
  },
  {
    key: "restaurant",
    label: "Restaurante",
    vertical: "restaurant_delivery",
    modules: [
      "restaurant_dashboard",
      "restaurant_menu",
      "restaurant_tables",
      "restaurant_orders",
      "restaurant_kitchen",
      "restaurant_delivery",
      "restaurant_couriers",
      "restaurant_delivery_zones",
    ],
  },
  {
    key: "building_materials",
    label: "Material de Construção",
    vertical: "building_materials",
    modules: BUILDING_MATERIALS_MODULES,
  },
  { key: "hospitality", label: "Hotelaria", vertical: "hospitality", modules: [] },
  { key: "auto_repair", label: "Oficina", vertical: "auto_repair", modules: [] },
].filter((t) => t.key === "general" || t.key === "cleaning") as Array<{
  key: ModuleTabKey;
  label: string;
  vertical: BusinessVertical | null;
  modules: ModuleKey[];
}>; // Ramos não-limpeza ocultos de momento (decisão 2026-09-28).


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

export const RESTAURANT_ROUTE_MODULES: Array<{ prefix: string; module: ModuleKey }> = [
  { prefix: "/app/restaurante/pedidos", module: "restaurant_orders" },
  { prefix: "/app/restaurante/mesas", module: "restaurant_tables" },
  { prefix: "/app/restaurante/cozinha", module: "restaurant_kitchen" },
  { prefix: "/app/restaurante/delivery", module: "restaurant_delivery" },
  { prefix: "/app/restaurante/menu", module: "restaurant_menu" },
  { prefix: "/app/restaurante/entregadores", module: "restaurant_couriers" },
  { prefix: "/app/restaurante/zonas", module: "restaurant_delivery_zones" },
  { prefix: "/app/restaurante", module: "restaurant_dashboard" },
];

export function normalizeBillingCountry(country: string | null | undefined): BillingCountry {
  if (country === "BR" || country === "BE" || country === "ES") return country;
  return "PT";
}

export function normalizeModules(modules: CompanyBilling["enabled_modules"]): ModuleKey[] {
  const values = Array.isArray(modules) && modules.length > 0 ? modules : DEFAULT_ENABLED_MODULES;
  return Array.from(
    new Set([
      // ADR-047 — piso mínimo: módulos essenciais nunca somem do menu.
      ...ESSENTIAL_MODULES,
      ...values.filter((m): m is ModuleKey => Object.prototype.hasOwnProperty.call(MODULE_CATALOG, m)),
    ]),
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
