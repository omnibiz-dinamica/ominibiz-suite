import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { buildAppUrl } from "@/lib/app-url";

export const Route = createFileRoute("/aceitar-convite")({
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = Route.useSearch();
  const { user, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ email: string; company_name: string } | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"loading" | "new" | "existing" | "logged">("loading");

  // Look up invite metadata (public via RPC-less direct query is restricted; we infer minimally)
  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) return;
      // Try to fetch invite (only invitee with matching email or super admin can read)
      const { data } = await supabase.rpc("get_invite_preview", { _token: token });
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.status === "pending") {
        setInvite({ email: row.email, company_name: row.company_name });
      }
    })();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (loading) return;
    if (user) setMode("logged");
    else setMode(invite ? "new" : "new");
  }, [loading, user, invite]);

  // Auto-accept once logged in
  useEffect(() => {
    if (mode === "logged" && token) void accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const setupAndAccept = async (e: FormEvent) => {
    e.preventDefault();
    if (!invite) {
      toast.error("Convite inválido ou expirado");
      return;
    }
    setBusy(true);
    const { error: signErr } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: {
        emailRedirectTo: buildAppUrl(`/aceitar-convite?token=${token}`),
        data: { full_name: name },
      },
    });
    if (signErr) {
      // If user already exists, try sign-in
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });
      if (loginErr) {
        setBusy(false);
        toast.error(signErr.message);
        return;
      }
    }
    await accept();
  };

  const accept = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("accept_invite", { _token: token });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success(`Bem-vindo${invite?.company_name ? ` à ${invite.company_name}` : ""}!`);
    nav({ to: "/app" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 inline-flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground font-display font-bold">O</div>
          <span className="font-display text-xl font-semibold">OmniBiz</span>
        </div>
        <h1 className="font-display text-2xl font-semibold">
          {invite ? `Bem-vindo à ${invite.company_name}` : "Convite OmniBiz"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "logged"
            ? "Confirmando seu acesso..."
            : "Defina sua senha para acessar o painel operacional."}
        </p>

        {mode !== "logged" && (
          <form onSubmit={setupAndAccept} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={invite?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Seu nome</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !token || !invite}>
              {busy ? "Processando..." : "Entrar no OmniBiz"}
            </Button>
            {!invite && token && (
              <p className="text-center text-xs text-muted-foreground">
                Convite não encontrado ou já utilizado.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}