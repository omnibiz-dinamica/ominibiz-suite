import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function SignupPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const redirectUrl = `${window.location.origin}/app`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl, data: { full_name: name } },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setLoading(false);
      toast.success("Confirme seu email para entrar.");
      nav({ to: "/login" });
      return;
    }
    // Logged in: create company (status=pending até aprovação do super admin)
    const slug = `${slugify(companyName)}-${Date.now().toString(36)}`;
    const { error: rpcErr } = await supabase.rpc("create_company_with_owner", {
      _name: companyName,
      _slug: slug,
    });
    setLoading(false);
    if (rpcErr) {
      toast.error(rpcErr.message);
      return;
    }
    toast.success("Conta criada! Sua empresa está aguardando aprovação.");
    nav({ to: "/app" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <Link to="/" className="mb-6 inline-flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground font-display font-bold">O</div>
          <span className="font-display text-xl font-semibold">OmniBiz</span>
        </Link>
        <h1 className="font-display text-2xl font-semibold">Criar empresa</h1>
        <p className="mt-1 text-sm text-muted-foreground">Você será o gestor responsável.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Seu nome</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Nome da empresa</Label>
            <Input id="company" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar conta e empresa"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}