import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  ChevronDown,
  Repeat,
  LifeBuoy,
  UserCircle,
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
  normalizeBusinessVertical,
} from "@/lib/locale";
import { resolveAvailableNavigation, type NavGroup } from "@/lib/navigation";

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
  const showDiagnostics = import.meta.env.DEV || import.meta.env.VITE_SHOW_DIAGNOSTICS === "true";

  if (!showDiagnostics) return null;

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

const GROUPS_STORAGE_KEY = "omnibiz:sidebar:groups:v2";
const FORCE_MENU_CLOSED_KEY = "omnibiz:force-mobile-menu-closed";
const MOBILE_QUERY = "(max-width: 767px)";

export function AppLayout({ children }: { children?: ReactNode }) {
  const { user, isSuperAdmin, currentCompanyId, signOut, effectiveRole, switchCompany, initialized } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [breakpointReady, setBreakpointReady] = useState(false);
  const qc = useQueryClient();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const superAdminOperating = isSuperAdmin && !!currentCompanyId;

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => {
      const nextIsMobile = mq.matches;
      setIsMobile(nextIsMobile);
      setBreakpointReady(true);
      if (nextIsMobile) setOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [path, effectiveRole, currentCompanyId, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldForceClosed = window.sessionStorage.getItem(FORCE_MENU_CLOSED_KEY) === "1";
    if (!shouldForceClosed) return;
    window.sessionStorage.removeItem(FORCE_MENU_CLOSED_KEY);
    setOpen(false);
    document.body.style.overflow = "";
  }, []);

  useEffect(() => {
    if (!breakpointReady || !isMobile) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [breakpointReady, isMobile, open]);

  const { data: activeCompany, isFetched: companyFetched } = useQuery({
    queryKey: ["active-company-name", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("companies" as any) as any)
        .select("id, name, enabled_modules, business_vertical")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      return data as {
        id: string;
        name: string;
        enabled_modules?: string[] | null;
        business_vertical?: string | null;
      } | null;
    },
  });
  const businessVertical = useMemo(
    () => normalizeBusinessVertical(activeCompany?.business_vertical ?? null),
    [activeCompany],
  );
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

  // Badge de app (PWA): reflete notificações não lidas no ícone instalado.
  useEffect(() => {
    const n = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (unreadNotifications > 0) {
        void n.setAppBadge?.(unreadNotifications)?.catch(() => {});
      } else {
        void n.clearAppBadge?.()?.catch(() => {});
      }
    } catch {
      /* ignora ambientes sem suporte */
    }
  }, [unreadNotifications]);

  // Contexto necessário para resolver a navegação. Loading NUNCA é tratado
  // como "sem permissão" (ADR-030).
  const contextReady =
    initialized && !!effectiveRole && (!currentCompanyId || companyFetched);

  const { ready: navReady, groups } = useMemo(() => {
    const resolved = resolveAvailableNavigation({
      effectiveRole,
      isSuperAdmin,
      companyId: currentCompanyId,
      vertical: businessVertical,
      enabledModules,
      employeeHasVehicle: hasVehicle,
      contextReady,
    });
    return {
      ready: resolved.ready,
      groups: resolved.groups.map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.to === "/app/notificacoes" ? { ...item, badge: unreadNotifications } : item,
        ),
      })) as NavGroup[],
    };
  }, [
    effectiveRole,
    isSuperAdmin,
    currentCompanyId,
    businessVertical,
    enabledModules,
    hasVehicle,
    contextReady,
    unreadNotifications,
  ]);

  useEffect(() => {
    if (!contextReady) return;
    if (!currentCompanyId || path === "/app" || path.startsWith("/app/admin")) return;
    const module = moduleForPath(path);
    if (!module || isModuleEnabled(enabledModules, module)) return;
    toast.error("Módulo desativado para esta empresa.");
    nav({ to: "/app" });
  }, [contextReady, currentCompanyId, enabledModules, nav, path]);

  // Collapsible group state, persisted in localStorage.
  // Initialise empty to avoid SSR/client hydration mismatch, then hydrate from storage.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const collapsedHydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GROUPS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        // Só persistimos estado booleano válido; qualquer lixo é descartado.
        const clean: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(parsed ?? {})) if (v === true) clean[k] = true;
        setCollapsed(clean);
      }
      window.localStorage.removeItem("omnibiz:sidebar:groups:v1");
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
    <div className="flex min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          "max-w-[85vw] md:max-w-none",
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
      {open && isMobile && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <button
            className="md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            disabled={!breakpointReady}
          >
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
          {effectiveRole !== "employee" && effectiveRole !== null && (
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
        {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DIAGNOSTICS === "true") && (
          <footer className="border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground md:px-8">
            <DeploymentDiagnostics />
          </footer>
        )}
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
