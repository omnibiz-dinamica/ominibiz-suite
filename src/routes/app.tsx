import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

function AppShell() {
  const { loading, initialized, user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (initialized && !loading && !user) nav({ to: "/login" });
  }, [initialized, loading, user, nav]);

  if (!initialized || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!user) return null;

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}