import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  UserCircle,
  ListChecks,
  Plane,
  Car,
  FileSignature,
  Receipt,
  ChevronDown,
  Repeat,
  CreditCard,
  LifeBuoy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { NewTicketDialog } from "@/components/support/NewTicketDialog";
import {
  DEFAULT_ENABLED_MODULES,
  isModuleEnabled,
  moduleForPath,
  normalizeModules,
  type ModuleKey,
} from "@/lib/locale";

function detectBrowser(): { name: string; version: string } {
  if (typeof navigator === "undefined") return { name: "ssr", version: "" };
  const ua = navigator.userAgent;
  // Order matters: Edge/Opera/Brave impersonate Chrome UA
  const tests: Array<[string, RegExp]> = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of tests) {
    const m = ua.match(re);
    if (m) return { name, version: m[1] };
  }
  return { name: "unknown", version: "" };
}

function DeploymentDiagnostics() {
  const build = (import.meta.env.VITE_BUILD_TIME ?? "dev") as string;
  const commit = ((import.meta.env.VITE_COMMIT_SHA ?? "dev") as string).slice(0, 7);
  const host = typeof window !== "undefined" ? window.location.host : "ssr";
  const env =
    /(^|\.)id-preview--/.test(host) || /(^|\.)preview--/.test(host)
      ? "preview"
      : host.includes("localhost")
        ? "local"
        : "prod";
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator?.standalone === true);
  const swSupported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const [swCount, setSwCount] = useState<number | null>(null);
  const { name: browser, version: browserVersion } = detectBrowser();

  useEffect(() => {
    if (!swSupported) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => setSwCount(regs.length))
      .catch(() => setSwCount(-1));
  }, [swSupported]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
      <span className="font-sans">OmniBiz · Diagnóstico</span>
      <span>
        v1 · build {build} · commit {commit} · env {env} · host {host} · {browser} {browserVersion} · pwa{" "}
        {isStandalone ? "on" : "off"} · sw {swCount === null ? "?" : swCount === -1 ? "err" : swCount}
      </span>
    </div>
  );
}

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  module?: ModuleKey;
  soon?: boolean;
  badge?: number;
};

type Group = { id: string; label: string; items: Item[] };

const GROUPS_STORAGE_KEY = "omnibiz:sidebar:groups:v1";

function buildGroups(args: {
  role: "super_admin" | "manager" | "employee";
  superAdminOperating: boolean;
  employeeHasVehicle: boolean;
}): Group[] {
  const { role, superAdminOperating, employeeHasVehicle } = args;

  if (role === "super_admin" && !superAdminOperating) {
    return [
      {
        id: "operacao",
        label: "Operação",
        items: [
          { to: "/app", label: "Dashboard Global", icon: LayoutDashboard },
          { to: "/app/notificacoes", label: "Notificações", icon: Bell },
        ],
      },
      {
        id: "administracao",
        label: "Administração",
        items: [{ to: "/app/admin", label: "Empresas", icon: Building2 }],
      },
      {
        id: "comercial",
        label: "Comercial",
        items: [{ to: "/app/comercial", label: "Comercial", icon: FileSignature }],
      },
      {
        id: "suporte-global",
        label: "Suporte Global",
        items: [{ to: "/app/admin/suporte", label: "Todos os Tickets", icon: LifeBuoy }],
      },
      {
        id: "conta",
        label: "Conta",
        items: [{ to: "/app/perfil", label: "Perfil", icon: UserCircle }],
      },
    ];
  }

  if (role === "employee") {
    const operacao: Item[] = [
      { to: "/app", label: "Minha Operação", icon: LayoutDashboard },
      { to: "/app/ponto", label: "Folha de Ponto", icon: Clock, module: "time_clock" },
      { to: "/app/tarefas", label: "Minhas Tarefas", icon: ListChecks, module: "tasks" },
      { to: "/app/notificacoes", label: "Notificações", icon: Bell },
    ];
    const rh: Item[] = [
      { to: "/app/meus-recibos", label: "Meus Recibos", icon: Receipt, module: "hr" },
      { to: "/app/ferias", label: "Férias", icon: Plane, module: "hr" },
      { to: "/app/despesas", label: "Despesas", icon: CreditCard, module: "finance" },
    ];
    const groups: Group[] = [
      { id: "operacao", label: "Operação", items: operacao },
      { id: "rh", label: "RH", items: rh },
      {
        id: "suporte",
        label: "Suporte",
        items: [{ to: "/app/suporte", label: "Meu Suporte", icon: LifeBuoy }],
      },
    ];
    if (employeeHasVehicle) {
      groups.push({
        id: "frota",
        label: "Frota",
        items: [{ to: "/app/frota", label: "Frota", icon: Car, module: "fleet" }],
      });
    }
    groups.push({
      id: "conta",
      label: "Conta",
      items: [{ to: "/app/perfil", label: "Perfil", icon: UserCircle }],
    });
    return groups;
  }

  // manager OR super admin operating inside a company
  const groups: Group[] = [
    {
      id: "operacao",
      label: "Operação",
      items: [
        { to: "/app", label: "Dashboard", icon: LayoutDashboard },
        { to: "/app/tarefas", label: "Tarefas", icon: ClipboardList, module: "tasks" },
        { to: "/app/ponto", label: "Folha de Ponto", icon: Clock, module: "time_clock" },
        { to: "/app/ponto/gestao", label: "Ponto · Gestão", icon: ListChecks, module: "time_clock" },
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
    {
      id: "administracao",
      label: "Administração",
      items: [{ to: "/app/empresa", label: "Empresa", icon: Building2 }],
    },
    {
      id: "frota",
      label: "Frota",
      items: [{ to: "/app/frota", label: "Frota", icon: Car, module: "fleet" }],
    },
    {
      id: "inteligencia",
      label: "Inteligência",
      items: [{ to: "/app/assistente", label: "Assistente IA", icon: Sparkles, module: "whatsapp_ai", soon: true }],
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

  // Central de Suporte — Gestor/Owner. Super Admin operando dentro de empresa
  // também vê (herança). Super Admin sem empresa acessa Central Global.
  groups.splice(groups.length - 1, 0, {
    id: "suporte",
    label: "Suporte",
    items: [{ to: "/app/suporte", label: "Central de Suporte", icon: LifeBuoy, module: "support" }],
  });

  if (superAdminOperating) {
    // já cai no bloco acima; adicionar entrada global
    groups.push({
      id: "suporte-global",
      label: "Suporte Global",
      items: [{ to: "/app/admin/suporte", label: "Todos os Tickets", icon: LifeBuoy }],
    });
  }

  if (superAdminOperating) {
    groups.splice(4, 0, {
      id: "superadmin",
      label: "Super Admin",
      items: [{ to: "/app/admin", label: "Empresas (Super Admin)", icon: Shield }],
    });
  }

  return groups;
}

export function AppLayout({ children }: { children?: ReactNode }) {
  const { user, isSuperAdmin, currentCompanyId, signOut, effectiveRole, switchCompany } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const superAdminOperating = isSuperAdmin && !!currentCompanyId;

  const { data: activeCompany } = useQuery({
    queryKey: ["active-company-name", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("companies" as any) as any)
        .select("id, name, enabled_modules")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      return data as { id: string; name: string; enabled_modules?: string[] | null } | null;
    },
  });
  const enabledModules = useMemo(
    () =>
      normalizeModules(
        (activeCompany as { enabled_modules?: string[] | null } | null)?.enabled_modules ?? DEFAULT_ENABLED_MODULES,
      ),
    [activeCompany],
  );

  const { data: hasVehicle = false } = useQuery({
    queryKey: ["my-vehicle-count", user?.id],
    enabled: !!user?.id && effectiveRole === "employee",
    queryFn: async () => {
      const { count } = await supabase
        .from("vehicle_assignments")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);
      return (count ?? 0) > 0;
    },
  });

  const { data: unreadNotifications = 0 } = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications" as never)
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const groups = useMemo(() => {
    if (!effectiveRole) return [] as Group[];
    const role = effectiveRole === "owner" ? "manager" : effectiveRole;
    return buildGroups({
      role: role as "super_admin" | "manager" | "employee",
      superAdminOperating,
      employeeHasVehicle: hasVehicle,
    })
      .map((group) => ({
        ...group,
        items: group.items
          .filter((item) => !item.module || isModuleEnabled(enabledModules, item.module))
          .map((item) => (item.to === "/app/notificacoes" ? { ...item, badge: unreadNotifications } : item)),
      }))
      .filter((group) => group.items.length > 0);
  }, [effectiveRole, superAdminOperating, hasVehicle, unreadNotifications, enabledModules]);

  useEffect(() => {
    if (!currentCompanyId || path === "/app" || path.startsWith("/app/admin")) return;
    const module = moduleForPath(path);
    if (!module || isModuleEnabled(enabledModules, module)) return;
    toast.error("Módulo desativado para esta empresa.");
    nav({ to: "/app" });
  }, [currentCompanyId, enabledModules, nav, path]);

  // Collapsible group state, persisted in localStorage.
  // Initialise empty to avoid SSR/client hydration mismatch, then hydrate from storage.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const collapsedHydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GROUPS_STORAGE_KEY);
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    } finally {
      collapsedHydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!collapsedHydrated.current) return;
    try {
      window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      /* ignore quota errors */
    }
  }, [collapsed]);

  // Auto-expand the group that contains the active route.
  useEffect(() => {
    const activeGroup = groups.find((g) =>
      g.items.some((it) => path === it.to || (it.to !== "/app" && path.startsWith(it.to))),
    );
    if (activeGroup && collapsed[activeGroup.id]) {
      setCollapsed((prev) => ({ ...prev, [activeGroup.id]: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, groups.length]);

  // Scroll-shadow indicator on the rolling nav area.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showBottomShadow, setShowBottomShadow] = useState(false);
  const [showTopShadow, setShowTopShadow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setShowTopShadow(el.scrollTop > 4);
      setShowBottomShadow(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [groups]);

  const roleBadge =
    effectiveRole === "super_admin"
      ? { label: "Super Admin", tone: "bg-destructive/15 text-destructive" }
      : effectiveRole === "manager"
        ? { label: "Gestor", tone: "bg-primary/15 text-primary" }
        : effectiveRole === "employee"
          ? { label: "Funcionário", tone: "bg-success/15 text-success" }
          : null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform md:sticky md:top-0 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Fixed header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-5">
          <Link to="/app" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-display font-bold">
              O
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">OmniBiz</span>
          </Link>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Fixed profile / context */}
        {(roleBadge || superAdminOperating) && (
          <div className="shrink-0 space-y-2 border-b border-sidebar-border/60 px-3 py-3">
            {roleBadge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  roleBadge.tone,
                )}
              >
                <Shield className="h-3 w-3" /> {roleBadge.label}
              </span>
            )}
            {superAdminOperating && activeCompany?.name && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
                <div className="text-[9px] uppercase tracking-wide opacity-80">Empresa ativa</div>
                <div className="truncate">{activeCompany.name}</div>
              </div>
            )}
          </div>
        )}

        {/* Scrollable navigation */}
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain px-2 py-3">
            <nav className="space-y-4">
              {groups.map((group) => {
                const isCollapsed = collapsed[group.id] ?? false;
                const groupHasActive = group.items.some(
                  (it) => path === it.to || (it.to !== "/app" && path.startsWith(it.to)),
                );
                return (
                  <div key={group.id}>
                    <button
                      type="button"
                      onClick={() => setCollapsed((prev) => ({ ...prev, [group.id]: !isCollapsed }))}
                      className={cn(
                        "group flex w-full items-center justify-between rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                        groupHasActive
                          ? "text-sidebar-foreground"
                          : "text-muted-foreground hover:text-sidebar-foreground",
                      )}
                      aria-expanded={!isCollapsed}
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn("h-3 w-3 transition-transform", isCollapsed ? "-rotate-90" : "rotate-0")}
                      />
                    </button>
                    {!isCollapsed && (
                      <ul className="mt-1 space-y-0.5">
                        {group.items.map((it) => {
                          const active = path === it.to || (it.to !== "/app" && path.startsWith(it.to));
                          const Icon = it.icon;
                          return (
                            <li key={it.to}>
                              <Link
                                to={it.to}
                                onClick={() => setOpen(false)}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                  active
                                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                )}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="flex-1 truncate">{it.label}</span>
                                {it.soon && (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                    em breve
                                  </span>
                                )}
                                {!it.soon && it.badge ? (
                                  <span className="min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-destructive-foreground">
                                    {it.badge > 99 ? "99+" : it.badge}
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}

              {isSuperAdmin && !currentCompanyId && (
                <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-3 text-xs text-sidebar-foreground">
                  Abra <strong>Empresas</strong>, crie ou selecione uma para operar usuários, clientes e tarefas.
                </div>
              )}
            </nav>
          </div>

          {/* Scroll shadow indicators */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-sidebar to-transparent transition-opacity",
              showTopShadow ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sidebar to-transparent transition-opacity",
              showBottomShadow ? "opacity-100" : "opacity-0",
            )}
          />
        </div>

        {/* Fixed footer */}
        <div className="shrink-0 space-y-1 border-t border-sidebar-border p-3">
          <div className="mb-1 px-2 text-xs text-muted-foreground truncate">{user?.email}</div>
          {superAdminOperating && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={async () => {
                await switchCompany(null);
                qc.invalidateQueries();
                toast.success("Saiu do modo operacional");
                nav({ to: "/app/admin" });
              }}
            >
              <Repeat className="mr-2 h-4 w-4" /> Trocar empresa
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await signOut();
              nav({ to: "/login" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            {superAdminOperating && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
                <Shield className="h-3.5 w-3.5" />
                <span className="truncate">
                  MODO SUPER ADMIN — Empresa ativa: <strong>{activeCompany?.name ?? "..."}</strong>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 border-destructive/40 px-2 text-[11px]"
                  onClick={async () => {
                    await switchCompany(null);
                    qc.invalidateQueries();
                    toast.success("Saiu do modo operacional");
                    nav({ to: "/app/admin" });
                  }}
                >
                  Sair da empresa
                </Button>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {effectiveRole !== null && (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setReportDialogOpen(true)}
              disabled={!currentCompanyId}
              title={!currentCompanyId ? "Selecione uma empresa antes de reportar" : "Reportar problema nesta tela"}
            >
              <LifeBuoy className="mr-1.5 h-4 w-4" /> Reportar problema
            </Button>
          )}
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-10">{children ?? <Outlet />}</main>
        <footer className="border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground md:px-8">
          <DeploymentDiagnostics />
        </footer>
      </div>

      <NewTicketDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        defaultType="erro"
        defaultTitle=""
        defaultModule={typeof window !== "undefined" ? window.location.pathname.replace(/^\/app\/?/, "") : ""}
      />
    </div>
  );
}
