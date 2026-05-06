import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

function AppShell() {
  const { loading, user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  if (loading) {
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