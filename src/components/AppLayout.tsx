import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
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
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  soon?: boolean;
};

const SUPER_ADMIN_MENU: Item[] = [
  { to: "/app", label: "Dashboard Global", icon: LayoutDashboard },
  { to: "/app/admin", label: "Empresas", icon: Building2 },
  { to: "/app/notificacoes", label: "Notificações", icon: Bell },
  { to: "/app/perfil", label: "Perfil", icon: UserCircle },
];

const MANAGER_MENU: Item[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/tarefas", label: "Tarefas", icon: ClipboardList },
  { to: "/app/ponto", label: "Folha de Ponto", icon: Clock },
  { to: "/app/notificacoes", label: "Notificações", icon: Bell },
  { to: "/app/clientes", label: "Clientes", icon: Briefcase },
  { to: "/app/equipe", label: "Usuários", icon: Users },
  { to: "/app/empresa", label: "Empresa", icon: Building2 },
  { to: "/app/notas", label: "Notas", icon: FileText, soon: true },
  { to: "/app/assistente", label: "Assistente IA", icon: Sparkles, soon: true },
  { to: "/app/perfil", label: "Perfil", icon: UserCircle },
];

const EMPLOYEE_MENU: Item[] = [
  { to: "/app", label: "Minha Operação", icon: LayoutDashboard },
  { to: "/app/ponto", label: "Folha de Ponto", icon: Clock },
  { to: "/app/tarefas", label: "Minhas Tarefas", icon: ListChecks },
  { to: "/app/notificacoes", label: "Notificações", icon: Bell },
  { to: "/app/perfil", label: "Perfil", icon: UserCircle },
];

export function AppLayout({ children }: { children?: ReactNode }) {
  const { user, isSuperAdmin, currentCompanyId, signOut, effectiveRole } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const visible =
    effectiveRole === "super_admin"
      ? SUPER_ADMIN_MENU
      : effectiveRole === "manager"
        ? MANAGER_MENU
        : effectiveRole === "employee"
          ? EMPLOYEE_MENU
          : [];

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
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-sidebar-border bg-sidebar transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
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

        {roleBadge && (
          <div className="px-3 pt-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                roleBadge.tone,
              )}
            >
              <Shield className="h-3 w-3" /> {roleBadge.label}
            </span>
          </div>
        )}

        <nav className="space-y-1 p-3">
          {visible.map((it) => {
            const active = path === it.to || (it.to !== "/app" && path.startsWith(it.to));
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{it.label}</span>
                {it.soon && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    em breve
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {isSuperAdmin && !currentCompanyId && (
          <div className="mx-3 rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-3 text-xs text-sidebar-foreground">
            Abra <strong>Super Admin</strong>, crie ou selecione uma empresa para operar usuários,
            clientes e tarefas.
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 border-t border-sidebar-border p-3">
          <div className="mb-2 px-2 text-xs text-muted-foreground truncate">{user?.email}</div>
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

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-10">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
