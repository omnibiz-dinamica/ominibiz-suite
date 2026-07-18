import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { buildAppUrl } from "@/lib/app-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, CheckCircle2, Copy, Plus, MailCheck, AlertCircle } from "lucide-react";
import { COUNTRIES, countryDefaults, slugify, type CountryCode } from "@/lib/locale";
import { RoleGuard } from "@/components/RoleGuard";
import { sendInviteEmail } from "@/lib/invites/send-invite-email";

export const Route = createFileRoute("/app/admin")({
  component: () => (
    <RoleGuard allow={["super_admin"]}>
      <AdminRouteContent />
    </RoleGuard>
  ),
});

function AdminRouteContent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isListRoute = pathname === "/app/admin" || pathname === "/app/admin/";

  return isListRoute ? <AdminPage /> : <Outlet />;
}

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
  const [result, setResult] = useState<{
    email: string;
    link: string;
    companyName: string;
    emailSent: boolean;
    emailError?: string;
  } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const d = countryDefaults(country);
      const slug = `${slugify(name)}-${Date.now().toString(36)}`;
      const recipient = adminEmail.trim().toLowerCase();
      const companyName = name.trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("admin_create_company_with_invite", {
        _name: companyName,
        _slug: slug,
        _country: country,
        _currency: d.currency,
        _language: d.language,
        _timezone: d.timezone,
        _admin_email: recipient,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const inviteId: string = row.invite_id;
      const token: string = row.invite_token;
      const companyId: string = row.company_id;
      const link = buildAppUrl(`/aceitar-convite?token=${token}`);

      let emailSent = true;
      let emailError: string | undefined;
      try {
        await sendInviteEmail({
          inviteId,
          token,
          email: recipient,
          role: "manager",
          companyId,
          companyName,
          sendCount: 1,
          kind: "create",
        });
      } catch (e) {
        emailSent = false;
        emailError = e instanceof Error ? e.message : String(e);
        console.warn("[admin] Falha ao enviar convite automaticamente", e);
      }

      return { companyId, email: recipient, link, companyName, emailSent, emailError };
    },
    onSuccess: async (row) => {
      setResult({
        email: row.email,
        link: row.link,
        companyName: row.companyName,
        emailSent: row.emailSent,
        emailError: row.emailError,
      });
      setName("");
      setAdminName("");
      setAdminEmail("");
      await switchCompany(row.companyId);
      await refresh();
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      if (row.emailSent) {
        toast.success(`Empresa criada com sucesso. Convite enviado para ${row.email}.`);
      } else {
        toast.warning(`Empresa criada. Envio automático do email falhou — use o envio manual como contingência.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Super Admin</h1>
          <p className="mt-1 text-muted-foreground">
            Crie empresas e escolha em qual operação o super admin está trabalhando.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setResult(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Criar empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova empresa</DialogTitle>
            </DialogHeader>
            {result ? (
              <div className="space-y-4">
                {result.emailSent ? (
                  <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
                    <MailCheck className="mt-0.5 h-4 w-4 text-success" />
                    <div>
                      <p className="font-medium">Empresa criada com sucesso.</p>
                      <p className="text-muted-foreground">
                        Convite enviado para <span className="font-medium">{result.email}</span>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
                    <div>
                      <p className="font-medium">Empresa criada, mas o envio automático falhou.</p>
                      <p className="text-muted-foreground">
                        Use o botão "Reenviar convite" em <b>Empresa</b> ou copie o link abaixo como contingência.
                      </p>
                      {result.emailError && <p className="mt-1 text-xs text-muted-foreground">{result.emailError}</p>}
                    </div>
                  </div>
                )}
                <details className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  <summary className="cursor-pointer select-none text-muted-foreground">
                    Envio manual (contingência)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="break-all rounded-md border border-border bg-background p-2">{result.link}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        navigator.clipboard.writeText(result.link);
                        toast.success("Link copiado");
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copiar link do convite
                    </Button>
                  </div>
                </details>
                <Button
                  className="w-full"
                  onClick={() => {
                    setResult(null);
                    setOpen(false);
                  }}
                >
                  Concluir
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label>Nome da empresa</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>País operacional</Label>
                    <Select value={country} onValueChange={(v) => setCountry(v as CountryCode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Configuração</Label>
                    <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {countryDefaults(country).currency} · {countryDefaults(country).language} ·{" "}
                      {countryDefaults(country).timezone}
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
                    nav({ to: "/app" });
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
