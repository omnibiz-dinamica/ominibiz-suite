import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, CheckCircle2, Copy, Plus } from "lucide-react";
import { COUNTRIES, countryDefaults, slugify, type CountryCode } from "@/lib/locale";

export const Route = createFileRoute("/app/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { isSuperAdmin, loading, currentCompanyId, switchCompany, refresh } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isSuperAdmin) nav({ to: "/app" });
  }, [loading, isSuperAdmin, nav]);

  const { data: companies } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, slug, country, currency, language, timezone, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuperAdmin,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [country, setCountry] = useState<CountryCode>("PT");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const d = countryDefaults(country);
      const slug = `${slugify(name)}-${Date.now().toString(36)}`;
      const { data, error } = await supabase.rpc("admin_create_company_with_invite", {
        _name: name,
        _slug: slug,
        _country: country,
        _currency: d.currency,
        _language: d.language,
        _timezone: d.timezone,
        _admin_email: adminEmail.trim().toLowerCase(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { company_id: string; invite_token: string };
    },
    onSuccess: async (row) => {
      const link = `${window.location.origin}/aceitar-convite?token=${row.invite_token}`;
      setCreatedLink(link);
      setName("");
      setAdminName("");
      setAdminEmail("");
      await switchCompany(row.company_id);
      await refresh();
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Empresa criada e convite gerado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Super Admin</h1>
          <p className="mt-1 text-muted-foreground">Crie empresas e escolha em qual operação o super admin está trabalhando.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCreatedLink(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Criar empresa</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova empresa</DialogTitle>
            </DialogHeader>
            {createdLink ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Empresa criada. Envie este link ao administrador para concluir o acesso:
                </p>
                <div className="rounded-lg border border-border bg-muted p-3 text-xs break-all">{createdLink}</div>
                <Button className="w-full" onClick={() => { navigator.clipboard.writeText(createdLink); toast.success("Link copiado"); }}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar link do convite
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
              >
                <div className="space-y-1.5">
                  <Label>Nome da empresa</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>País operacional</Label>
                    <Select value={country} onValueChange={(v) => setCountry(v as CountryCode)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Configuração</Label>
                    <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {countryDefaults(country).currency} · {countryDefaults(country).language} · {countryDefaults(country).timezone}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Nome do administrador</Label>
                  <Input required value={adminName} onChange={(e) => setAdminName(e.target.value)} maxLength={100} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email do administrador</Label>
                  <Input type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending} className="w-full">
                    {create.isPending ? "Criando..." : "Criar empresa e gerar convite"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Empresas</h2>
        <ul className="mt-4 divide-y divide-border">
          {(companies ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.country} · {c.currency} · {c.timezone}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {currentCompanyId === c.id && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                    <CheckCircle2 className="h-3 w-3" /> Em operação
                  </span>
                )}
                <Button
                  size="sm"
                  variant={currentCompanyId === c.id ? "secondary" : "outline"}
                  onClick={async () => {
                    await switchCompany(c.id);
                    await refresh();
                    qc.invalidateQueries();
                    toast.success(`Operando ${c.name}`);
                  }}
                >
                  {currentCompanyId === c.id ? "Selecionada" : "Operar empresa"}
                </Button>
              </div>
            </li>
          ))}
          {(companies ?? []).length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">Nenhuma empresa criada ainda.</li>
          )}
        </ul>
      </div>
    </div>
  );
}