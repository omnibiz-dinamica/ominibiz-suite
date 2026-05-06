import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/aceitar-convite")({
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = Route.useSearch();
  const { user, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      // store token and go login
      sessionStorage.setItem("pending-invite-token", token);
      nav({ to: "/login" });
    }
  }, [loading, user, token, nav]);

  const accept = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("accept_invite", { _token: token });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("Convite aceito! Bem-vindo à equipe.");
    nav({ to: "/app" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <h1 className="font-display text-2xl font-semibold">Aceitar convite</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Você foi convidado para uma empresa no OmniBiz. Confirme para entrar na equipe.
        </p>
        <Button className="mt-6 w-full" onClick={accept} disabled={busy || !token}>
          {busy ? "Processando..." : "Aceitar convite"}
        </Button>
      </div>
    </div>
  );
}