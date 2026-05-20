import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth";

export function RoleGuard({
  allow,
  children,
  redirectTo = "/app",
}: {
  allow: AppRole[];
  children: ReactNode;
  redirectTo?: string;
}) {
  const { initialized, loading, effectiveRole } = useAuth();
  const nav = useNavigate();

  const allowed = !!effectiveRole && allow.includes(effectiveRole);

  useEffect(() => {
    if (initialized && !loading && !allowed) {
      nav({ to: redirectTo });
    }
  }, [initialized, loading, allowed, nav, redirectTo]);

  if (!initialized || loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="font-display text-xl font-semibold">Acesso restrito</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Este módulo não está disponível para o seu papel.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}