import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { buildAppUrl } from "@/lib/app-url";
import { useT } from "@/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("Bem-vindo!"));
    nav({ to: "/app" });
  };

  const onForgotPassword = async () => {
    if (!email) {
      toast.error(t("Informe seu email acima para receber o link de recuperação."));
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildAppUrl("/reset-password"),
    });
    setResetting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("Enviámos um link de recuperação para o seu email."));
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-2 flex justify-end"><LanguageSwitcher /></div>
        <Link to="/" className="mb-6 inline-flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground font-display font-bold">O</div>
          <span className="font-display text-xl font-semibold">OmniBiz</span>
        </Link>
        <h1 className="font-display text-2xl font-semibold">{t("Entrar")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("Acesse seu painel operacional.")}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("Email")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("Senha")}</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={resetting}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {resetting ? t("Enviando...") : t("Esqueci minha senha")}
            </button>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("Entrando...") : t("Entrar")}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("OmniBiz é uma plataforma por convite. Solicite acesso ao seu administrador.")}
        </p>
      </div>
    </div>
  );
}