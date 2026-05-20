import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { LayoutDashboard, Users, FileText, FilePlus2, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/comercial")({
  component: CommercialLayout,
});

const tabs = [
  { to: "/app/comercial", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/comercial/clientes", label: "Clientes", icon: Users },
  { to: "/app/comercial/contratos", label: "Contratos", icon: FileText },
  { to: "/app/comercial/contratos/novo", label: "Novo contrato", icon: FilePlus2 },
  { to: "/app/comercial/templates", label: "Templates", icon: FileCode2 },
];

function CommercialLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <RoleGuard allow={["super_admin"]}>
      <div className="space-y-6">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Comercial
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Gestão Comercial & Contratos
          </h1>
          <p className="mt-1 text-muted-foreground">
            Clientes, propostas, contratos e onboarding pós-assinatura.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {tabs.map((t) => {
            const active = t.exact ? path === t.to : path.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                onClick={() => {
                  if (t.to === "/app/comercial/contratos/novo")
                    console.log("Novo contrato clicked");
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </Link>
            );
          })}
        </div>

        <Outlet />
      </div>
    </RoleGuard>
  );
}
