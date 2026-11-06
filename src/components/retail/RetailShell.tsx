import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ModuleGuard } from "@/components/ModuleGuard";
import { RETAIL_ROLES } from "@/lib/retail";
import { useAuth, type AppRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

const MANAGER_ONLY = new Set<string>(["/app/lojas", "/app/lojas/produtos", "/app/lojas/categorias", "/app/lojas/estoque"]);
const TABS = [
  { to: "/app/lojas", label: "Lojas" },
  { to: "/app/lojas/produtos", label: "Produtos" },
  { to: "/app/lojas/categorias", label: "Categorias" },
  { to: "/app/lojas/estoque", label: "Estoque" },
  { to: "/app/lojas/pdv", label: "PDV" },
  { to: "/app/lojas/caixa", label: "Caixa" },
  { to: "/app/lojas/vendas", label: "Vendas" },
] as const;

/** Abas visíveis para o papel: funcionário só opera PDV, Caixa e Vendas. */
export function retailTabsFor(role: AppRole | null) {
  const isManager = !!role && (RETAIL_ROLES as readonly string[]).includes(role);
  return TABS.filter((t) => isManager || !MANAGER_ONLY.has(t.to));
}

export function RetailShell({
  title,
  desc,
  actions,
  children,
  allow = [...RETAIL_ROLES],
}: {
  title: string;
  desc: string;
  actions?: ReactNode;
  children: ReactNode;
  allow?: AppRole[];
}) {
  const { effectiveRole } = useAuth();
  return (
    <RoleGuard allow={allow}>
      <ModuleGuard module="retail_core">
        <div className="space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
            {actions}
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b border-border">
            {retailTabsFor(effectiveRole).map((t) => (
              <Link
                key={t.to}
                to={t.to}
                activeOptions={{ exact: true }}
                className={cn("whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground")}
                activeProps={{ className: "border-primary text-foreground font-medium" }}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          {children}
        </div>
      </ModuleGuard>
    </RoleGuard>
  );
}

export function StateBox({ kind, text }: { kind: "loading" | "empty" | "error"; text?: string }) {
  const msg = text ?? (kind === "loading" ? "A carregar…" : kind === "empty" ? "Sem registos." : "Erro ao carregar.");
  return (
    <div className={cn("rounded-lg border border-dashed border-border p-8 text-center text-sm", kind === "error" ? "text-destructive" : "text-muted-foreground")}>
      {msg}
    </div>
  );
}
