import {
  LayoutDashboard,
  ClipboardList,
  Shield,
  Clock,
  Bell,
  Users,
  Building2,
  Briefcase,
  Sparkles,
  FileText,
  UserCircle,
  ListChecks,
  Plane,
  Car,
  FileSignature,
  Receipt,
  CreditCard,
  LifeBuoy,
  UtensilsCrossed,
  ShoppingBag,
  ChefHat,
  Truck,
  BookOpen,
  Bike,
  MapPin,
  Package,
  Warehouse,
  Tags,
  Factory,
  ShoppingCart,

} from "lucide-react";
import { isModuleEnabled, type BusinessVertical, type ModuleKey } from "@/lib/locale";
import type { AppRole } from "@/lib/auth";

/**
 * OmniBiz · Fonte canónica de navegação (ADR-030).
 *
 * Regras invioláveis:
 *  1. UMA única função resolve o menu para Desktop, Drawer Mobile, atalhos e
 *     qualquer outro consumidor. Não existem listas paralelas.
 *  2. O ramo (business vertical) é ADITIVO: nunca remove módulos gerais/core.
 *     Ramo apenas ACRESCENTA grupos e define a ORDEM de apresentação.
 *  3. Contexto em carregamento NUNCA equivale a "sem permissão". Quando
 *     `contextReady === false`, o resolver devolve `ready: false` e o consumidor
 *     mostra skeleton — jamais um menu parcial.
 *  4. Itens sem `module` são core e estão sempre presentes para o perfil.
 */

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Quando definido, o item só aparece se o módulo estiver ativo na empresa. */
  module?: ModuleKey;
  soon?: boolean;
  badge?: number;
};

export type NavGroup = { id: string; label: string; items: NavItem[] };

export type NavContext = {
  effectiveRole: AppRole | null;
  isSuperAdmin: boolean;
  companyId: string | null;
  vertical: BusinessVertical;
  enabledModules: ModuleKey[];
  employeeHasVehicle: boolean;
  /** true só quando role + empresa + módulos estão resolvidos. */
  contextReady: boolean;
};

export type NavResolution = { ready: boolean; groups: NavGroup[] };

const RESTAURANT_ITEMS: NavItem[] = [
  { to: "/app/restaurante/pedidos", label: "Pedidos", icon: ShoppingBag, module: "restaurant_orders" },
  { to: "/app/restaurante/mesas", label: "Mesas", icon: UtensilsCrossed, module: "restaurant_tables" },
  { to: "/app/restaurante/cozinha", label: "Cozinha", icon: ChefHat, module: "restaurant_kitchen" },
  { to: "/app/restaurante/delivery", label: "Delivery", icon: Truck, module: "restaurant_delivery" },
  { to: "/app/restaurante/menu", label: "Menu", icon: BookOpen, module: "restaurant_menu" },
  { to: "/app/restaurante/entregadores", label: "Entregadores", icon: Bike, module: "restaurant_couriers" },
  { to: "/app/restaurante/zonas", label: "Zonas de Entrega", icon: MapPin, module: "restaurant_delivery_zones" },
];

/** ADR-033 — Material de Construção. Itens só aparecem com o módulo ativo. */
const BUILDING_MATERIALS_ITEMS: NavItem[] = [
  { to: "/app/material-construcao", label: "Visão Geral", icon: LayoutDashboard, module: "building_materials_dashboard" },
  { to: "/app/material-construcao/produtos", label: "Produtos", icon: Package, module: "building_materials_products" },
  { to: "/app/material-construcao/estoque", label: "Estoque", icon: Warehouse, module: "building_materials_inventory" },
  { to: "/app/material-construcao/categorias", label: "Categorias", icon: Tags, module: "building_materials_categories" },
  { to: "/app/material-construcao/fornecedores", label: "Fornecedores", icon: Factory, module: "building_materials_suppliers" },
  { to: "/app/material-construcao/compras", label: "Compras", icon: ShoppingCart, module: "building_materials_purchases" },
  { to: "/app/material-construcao/orcamentos", label: "Orçamentos", icon: FileText, module: "building_materials_quotes" },
  { to: "/app/material-construcao/vendas", label: "Vendas / PDV", icon: ShoppingBag, module: "building_materials_sales" },
  { to: "/app/material-construcao/clientes", label: "Clientes", icon: Briefcase, module: "building_materials_customers" },
  { to: "/app/material-construcao/entregas", label: "Entregas", icon: Truck, module: "building_materials_deliveries" },
  { to: "/app/material-construcao/financeiro", label: "Financeiro", icon: CreditCard, module: "building_materials_finance" },
];


function superAdminGlobalGroups(): NavGroup[] {
  return [
    {
      id: "operacao",
      label: "Operação",
      items: [
        { to: "/app", label: "Dashboard Global", icon: LayoutDashboard },
        { to: "/app/notificacoes", label: "Notificações", icon: Bell },
      ],
    },
    { id: "administracao", label: "Administração", items: [{ to: "/app/admin", label: "Empresas", icon: Building2 }] },
    { id: "comercial", label: "Comercial", items: [{ to: "/app/comercial", label: "Comercial", icon: FileSignature }] },
    {
      id: "suporte-global",
      label: "Suporte Global",
      items: [{ to: "/app/admin/suporte", label: "Todos os Tickets", icon: LifeBuoy }],
    },
    { id: "conta", label: "Conta", items: [{ to: "/app/perfil", label: "Perfil", icon: UserCircle }] },
  ];
}

function employeeGroups(employeeHasVehicle: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    {
      id: "operacao",
      label: "Operação",
      items: [
        { to: "/app", label: "Minha Operação", icon: LayoutDashboard },
        { to: "/app/ponto", label: "Folha de Ponto", icon: Clock, module: "time_clock" },
        { to: "/app/ponto/meus-relatorios", label: "Meus Relatórios", icon: FileText, module: "time_clock" },
        { to: "/app/tarefas", label: "Minhas Tarefas", icon: ListChecks, module: "tasks" },
        { to: "/app/notificacoes", label: "Notificações", icon: Bell },
      ],
    },
    {
      id: "rh",
      label: "RH",
      items: [
        { to: "/app/meus-recibos", label: "Meus Recibos", icon: Receipt, module: "hr" },
        { to: "/app/ferias", label: "Férias", icon: Plane, module: "hr" },
        { to: "/app/despesas", label: "Despesas", icon: CreditCard, module: "finance" },
      ],
    },
  ];
  if (employeeHasVehicle) {
    groups.push({ id: "frota", label: "Frota", items: [{ to: "/app/frota", label: "Frota", icon: Car, module: "fleet" }] });
  }
  groups.push({
    id: "suporte",
    label: "Suporte",
    items: [{ to: "/app/suporte", label: "Meu Suporte", icon: LifeBuoy, module: "support" }],
  });
  groups.push({ id: "conta", label: "Conta", items: [{ to: "/app/perfil", label: "Perfil", icon: UserCircle }] });
  return groups;
}

/** Contabilista: acesso restrito e somente leitura aos documentos liberados. */
function accountantGroups(): NavGroup[] {
  return [
    {
      id: "contabilidade",
      label: "Contabilidade",
      items: [
        { to: "/app/contabilidade/folhas-ponto", label: "Folhas de Ponto", icon: FileText, module: "time_clock" },
        { to: "/app/notificacoes", label: "Notificações", icon: Bell },
      ],
    },
    { id: "conta", label: "Conta", items: [{ to: "/app/perfil", label: "Perfil", icon: UserCircle }] },
  ];
}

function managerGroups(args: { superAdminOperating: boolean; vertical: BusinessVertical }): NavGroup[] {
  const { superAdminOperating, vertical } = args;

  const general: NavGroup[] = [
    {
      id: "operacao",
      label: "Operação",
      items: [
        { to: "/app", label: "Dashboard", icon: LayoutDashboard },
        { to: "/app/tarefas", label: "Tarefas", icon: ClipboardList, module: "tasks" },
        { to: "/app/ponto", label: "Folha de Ponto", icon: Clock, module: "time_clock" },
        { to: "/app/ponto/gestao", label: "Ponto · Gestão", icon: ListChecks, module: "time_clock" },
        { to: "/app/ponto/fechamento", label: "Fechamento Mensal", icon: FileText, module: "time_clock" },
        { to: "/app/notificacoes", label: "Notificações", icon: Bell },
      ],
    },
    {
      id: "rh",
      label: "RH",
      items: [
        { to: "/app/rh", label: "Dashboard RH", icon: LayoutDashboard, module: "hr" },
        { to: "/app/equipe", label: "Usuários", icon: Users, module: "hr" },
        { to: "/app/ferias", label: "Férias", icon: Plane, module: "hr" },
        { to: "/app/despesas", label: "Despesas", icon: CreditCard, module: "finance" },
        { to: "/app/rh/recibos", label: "Recibos", icon: Receipt, module: "hr" },
      ],
    },
    {
      id: "comercial",
      label: "Comercial",
      items: [
        { to: "/app/clientes", label: "Clientes", icon: Briefcase, module: "crm" },
        { to: "/app/comercial", label: "Contratos", icon: FileSignature, module: "crm" },
      ],
    },
    { id: "administracao", label: "Administração", items: [{ to: "/app/empresa", label: "Empresa", icon: Building2 }] },
    { id: "frota", label: "Frota", items: [{ to: "/app/frota", label: "Frota", icon: Car, module: "fleet" }] },
    {
      id: "inteligencia",
      label: "Inteligência",
      items: [{ to: "/app/assistente", label: "Assistente IA", icon: Sparkles, module: "whatsapp_ai", soon: true }],
    },
    {
      id: "suporte",
      label: "Suporte",
      items: [{ to: "/app/suporte", label: "Central de Suporte", icon: LifeBuoy, module: "support" }],
    },
    {
      id: "outros",
      label: "Outros",
      items: [
        { to: "/app/notas", label: "Notas", icon: FileText, module: "notes", soon: true },
        { to: "/app/perfil", label: "Perfil", icon: UserCircle },
      ],
    },
  ];

  // Ramo é ADITIVO: acrescenta o grupo do ramo. Nunca remove grupos gerais.
  const verticalGroup: NavGroup = { id: "restaurante", label: "Restaurante & Delivery", items: RESTAURANT_ITEMS };
  const materialsGroup: NavGroup = {
    id: "material-construcao",
    label: "Material de Construção",
    items: BUILDING_MATERIALS_ITEMS,
  };
  const groups =
    vertical === "restaurant_delivery"
      ? [general[0], verticalGroup, ...general.slice(1), materialsGroup]
      : vertical === "building_materials"
        ? [general[0], materialsGroup, ...general.slice(1), verticalGroup]
        : [...general, verticalGroup, materialsGroup];


  if (superAdminOperating) {
    groups.push({
      id: "superadmin",
      label: "Super Admin",
      items: [
        { to: "/app/admin", label: "Empresas (Super Admin)", icon: Shield },
        { to: "/app/admin/suporte", label: "Todos os Tickets", icon: LifeBuoy },
      ],
    });
  }

  return groups;
}

/** Resolver único e determinístico da navegação autorizada. */
export function resolveAvailableNavigation(ctx: NavContext): NavResolution {
  if (!ctx.contextReady || !ctx.effectiveRole) return { ready: false, groups: [] };

  const superAdminOperating = ctx.isSuperAdmin && !!ctx.companyId;
  const role = ctx.effectiveRole === "owner" ? "manager" : ctx.effectiveRole;

  const raw =
    role === "super_admin" && !superAdminOperating
      ? superAdminGlobalGroups()
      : role === "accountant"
        ? accountantGroups()
        : role === "employee"
          ? employeeGroups(ctx.employeeHasVehicle)
          : managerGroups({ superAdminOperating, vertical: ctx.vertical });

  return {
    ready: true,
    groups: raw
      .map((group) => ({
        ...group,
        // Itens core (sem `module`) nunca são filtrados.
        items: group.items.filter((item) => !item.module || isModuleEnabled(ctx.enabledModules, item.module)),
      }))
      .filter((group) => group.items.length > 0),
  };
}

/** Todos os caminhos autorizados — usado para coerência menu ↔ rota. */
export function resolveAuthorizedPaths(ctx: NavContext): string[] {
  return resolveAvailableNavigation(ctx).groups.flatMap((g) => g.items.map((i) => i.to));
}
