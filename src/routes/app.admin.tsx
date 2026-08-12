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
import { Dialog, DialogContent, DialogTrigger, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, CheckCircle2, Copy, Plus, MailCheck, AlertCircle, PlusCircle } from "lucide-react";
import {
  COUNTRIES,
  COUNTRY_CURRENCY,
  MODULE_CATALOG,
  MODULE_TABS,
  PLAN_OPTIONS,
  BUSINESS_VERTICALS,
  RESTAURANT_ENABLED_MODULES,
  normalizeBusinessVertical,
  billingAnnualTotal,
  billingMonthlyTotal,
  countryDefaults,
  formatBillingAmount,
  moduleAddonsMonthly,
  normalizeBillingCountry,
  normalizeModules,
  planMonthlyPrice,
  slugify,
  type BillingCycle,
  type BillingPlan,
  type CountryCode,
  type ModuleKey,
  type BusinessVertical,
  type ModuleTabKey,
} from "@/lib/locale";
import { RoleGuard } from "@/components/RoleGuard";
import { sendInviteEmail } from "@/lib/invites/send-invite-email";

export const Route = createFileRoute("/app/admin")({
  component: () => (
    <RoleGuard allow={["super_admin"]}>
      <AdminRouteContent />
    </RoleGuard>
  ),
});

type AdminCompany = {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  language: string;
  timezone: string;
  status: string;
  created_at: string;
  billing_plan?: BillingPlan | null;
  billing_cycle?: BillingCycle | null;
  billing_country?: string | null;
  billing_currency?: string | null;
  employee_limit?: number | null;
  user_limit?: number | null;
  enabled_modules?: ModuleKey[] | string[] | null;
  billing_notes?: string | null;
  business_vertical?: string | null;
};

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("companies" as any) as any)
        .select(
          "id, name, slug, country, currency, language, timezone, status, created_at, billing_plan, billing_cycle, billing_country, billing_currency, employee_limit, user_limit, enabled_modules, billing_notes, business_vertical",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminCompany[];
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
          <DialogContent size="md">
            <ModalHeader icon={PlusCircle} title="Nova empresa" description="Crie a empresa e gere o convite para o administrador." />
            {result ? (
              <ModalBody className="space-y-4">
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
              </ModalBody>
            ) : (
              <form
                id="admin-create-company-form"
                className="contents"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate();
                }}
              >
              <ModalBody className="space-y-4">
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
              </ModalBody>
              </form>
            )}
            {!result && (
              <ModalFooter>
                <Button type="submit" form="admin-create-company-form" disabled={create.isPending}>
                  {create.isPending ? "Criando..." : "Criar empresa e gerar convite"}
                </Button>
              </ModalFooter>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Empresas</h2>
        <ul className="mt-4 divide-y divide-border">
          {(companies ?? []).map((c) => (
            <li key={c.id} className="space-y-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
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
              </div>
              <BillingControls company={c} />
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

function BillingControls({ company }: { company: AdminCompany }) {
  const qc = useQueryClient();
  const initialCountry = normalizeBillingCountry(company.billing_country ?? company.country);
  const [plan, setPlan] = useState<BillingPlan>(company.billing_plan ?? "professional");
  const [cycle, setCycle] = useState<BillingCycle>(company.billing_cycle ?? "monthly");
  const [country, setCountry] = useState<"PT" | "BE" | "ES" | "BR">(initialCountry);
  const [modules, setModules] = useState<ModuleKey[]>(normalizeModules(company.enabled_modules));
  const [notes, setNotes] = useState(company.billing_notes ?? "");
  const [vertical, setVertical] = useState<BusinessVertical>(normalizeBusinessVertical(company.business_vertical));
  const [activeTab, setActiveTab] = useState<ModuleTabKey>(
    normalizeBusinessVertical(company.business_vertical) === "restaurant_delivery" ? "restaurant" : "general",
  );

  /**
   * ADR-027 — ao marcar a empresa como Restaurante & Delivery, ativa o pacote
   * de módulos do restaurante (sem remover os módulos já ativos).
   */
  const changeVertical = (next: BusinessVertical) => {
    setVertical(next);
    if (next === "restaurant_delivery") {
      setModules((current) => Array.from(new Set([...current, ...RESTAURANT_ENABLED_MODULES])));
    }
  };

  /**
   * ADR-028 (revisto) — as abas são apenas filtro visual: não alteram o ramo
   * principal da empresa nem marcam módulos automaticamente.
   */
  const selectTab = (key: ModuleTabKey) => setActiveTab(key);

  const currentTab = MODULE_TABS.find((t) => t.key === activeTab) ?? MODULE_TABS[0];

  const currency = COUNTRY_CURRENCY[country];
  const effectiveCompany = {
    billing_plan: plan,
    billing_cycle: cycle,
    billing_country: country,
    billing_currency: currency,
    enabled_modules: modules,
  };
  const monthly = billingMonthlyTotal(effectiveCompany);
  const annual = billingAnnualTotal(effectiveCompany);
  const baseMonthly = planMonthlyPrice(plan, country);
  const addonsMonthly = moduleAddonsMonthly(modules);
  const planLimits = PLAN_OPTIONS[plan];

  const toggleModule = (module: ModuleKey) => {
    if (MODULE_CATALOG[module].included) return;
    setModules((current) => (current.includes(module) ? current.filter((m) => m !== module) : [...current, module]));
  };

  const save = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("companies" as any) as any)
        .update({
          billing_plan: plan,
          billing_cycle: cycle,
          billing_country: country,
          billing_currency: currency,
          employee_limit: planLimits.employeeLimit,
          user_limit: planLimits.userLimit,
          enabled_modules: modules,
          billing_base_monthly: baseMonthly,
          billing_addons_monthly: addonsMonthly,
          billing_notes: notes.trim() || null,
          business_vertical: vertical,
        })
        .eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano e módulos atualizados");
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["active-company-name"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Ramo de atividade</Label>
          <Select value={vertical} onValueChange={(v) => changeVertical(v as BusinessVertical)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_VERTICALS.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Plano</Label>
          <Select value={plan} onValueChange={(v) => setPlan(v as BillingPlan)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PLAN_OPTIONS) as BillingPlan[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {PLAN_OPTIONS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ciclo</Label>
          <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="annual">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>País de faturação</Label>
          <Select value={country} onValueChange={(v) => setCountry(v as "PT" | "BE" | "ES" | "BR")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PT">Portugal</SelectItem>
              <SelectItem value="BE">Bélgica</SelectItem>
              <SelectItem value="ES">Espanha</SelectItem>
              <SelectItem value="BR">Brasil</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">Estimativa</div>
          <div className="font-semibold">
            {cycle === "annual"
              ? `${formatBillingAmount(annual, currency)}/ano`
              : `${formatBillingAmount(monthly, currency)}/mês`}
          </div>
          <div className="text-xs text-muted-foreground">
            {planLimits.employeeLimit ?? "Ilimitado"} funcionários · {planLimits.userLimit ?? "Ilimitado"} utilizadores
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 rounded-xl border border-border bg-background p-1">
        {MODULE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => selectTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentTab.modules.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
          Ramo preparado para futuras funcionalidades.
        </p>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {currentTab.modules.map((module) => {
          const item = MODULE_CATALOG[module];
          const checked = modules.includes(module);
          return (
            <label key={module} className="flex gap-3 rounded-lg border border-border bg-background p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={checked}
                disabled={item.included}
                onChange={() => toggleModule(module)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {item.label}
                  {item.addonMonthly > 0 && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      +{formatBillingAmount(item.addonMonthly, currency)}/mês
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label>Notas comerciais</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: desconto de lançamento, contrato anual, condição especial..."
            maxLength={240}
          />
        </div>
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "Salvar plano e módulos"}
        </Button>
      </div>
    </div>
  );
}
