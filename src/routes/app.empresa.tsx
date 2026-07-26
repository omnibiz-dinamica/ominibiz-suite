import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleGuard } from "@/components/RoleGuard";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GeoSettingsCard } from "@/components/empresa/GeoSettingsCard";
import { ManagerInviteCard } from "@/components/empresa/ManagerInviteCard";

export const Route = createFileRoute("/app/empresa")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin"]}>
      <CompanyPage />
    </RoleGuard>
  ),
});

function CompanyPage() {
  const { currentCompanyId, isManager } = useAuth();

  const { data: company } = useQuery({
    queryKey: ["company", currentCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", currentCompanyId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompanyId,
  });

  if (!isManager) return <div className="text-muted-foreground">Acesso restrito a gestores.</div>;
  if (!company) return <div className="text-muted-foreground">Nenhuma empresa associada.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Empresa</h1>
        <p className="mt-1 text-muted-foreground">Informações e status da sua empresa.</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" value={company.name} />
          <Field label="Slug" value={company.slug} />
          <Field label="País" value={company.country} />
          <Field label="Status" value={company.status} highlight />
        </dl>
        {company.status === "pending" && (
          <div className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
            Sua empresa está aguardando aprovação do Super Admin para ser ativada.
          </div>
        )}
      </div>

      <HRSettingsCard companyId={currentCompanyId!} />

      <DefaultRatesCard companyId={currentCompanyId!} />

      <ManagerInviteCard companyId={currentCompanyId!} companyName={company.name} />

      <GeoSettingsCard companyId={currentCompanyId!} />
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 ${highlight ? "font-display text-lg font-semibold" : "text-sm"}`}>{value}</dd>
    </div>
  );
}

/**
 * ADR-017 — Valores padrão da empresa.
 * Servem como fallback quando o cliente e o funcionário não sobrescrevem.
 * Hierarquia efetiva:
 *   1) profiles.manual_* (override do funcionário)
 *   2) clients.hourly_rate / fixed_rate / monthly_rate (valor do cliente)
 *   3) companies.default_* (este card)
 */
function DefaultRatesCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["company-default-rates", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("companies") as any)
        .select("default_hourly_rate,default_fixed_rate,default_monthly_rate")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as {
        default_hourly_rate: number | null;
        default_fixed_rate: number | null;
        default_monthly_rate: number | null;
      };
    },
  });

  const [hourly, setHourly] = useState("");
  const [fixed, setFixed] = useState("");
  const [monthly, setMonthly] = useState("");

  useEffect(() => {
    if (data) {
      setHourly(data.default_hourly_rate == null ? "" : String(data.default_hourly_rate));
      setFixed(data.default_fixed_rate == null ? "" : String(data.default_fixed_rate));
      setMonthly(data.default_monthly_rate == null ? "" : String(data.default_monthly_rate));
    }
  }, [data]);

  const toNum = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from("companies") as any)
        .update({
          default_hourly_rate: toNum(hourly),
          default_fixed_rate: toNum(fixed),
          default_monthly_rate: toNum(monthly),
        })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Valores padrão atualizados");
      qc.invalidateQueries({ queryKey: ["company-default-rates", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-lg font-semibold">Valores padrão</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Usados quando o cliente e o funcionário não têm valor próprio. Deixe em branco para não aplicar.
      </p>

      {isLoading ? (
        <div className="mt-4 text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="def-hourly">Valor/hora padrão</Label>
            <input
              id="def-hourly"
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0,00"
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="def-fixed">Valor fixo padrão (por tarefa)</Label>
            <input
              id="def-fixed"
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0,00"
              value={fixed}
              onChange={(e) => setFixed(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="def-monthly">Mensalidade padrão</Label>
            <input
              id="def-monthly"
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0,00"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          Salvar valores padrão
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Hierarquia: funcionário &gt; cliente &gt; empresa. Alterar aqui não afeta clientes/funcionários com valor próprio.
      </p>
    </div>
  );
}

type EmployeeApproverKind = "manager" | "supervisor" | "owner" | "specific_user";
type ManagerApproverKind = "owner" | "other_manager" | "specific_user" | "self_allowed";

function HRSettingsCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["hr-settings", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_hr_settings")
        .select(
          "company_id, default_punch_mode, employee_approver_kind, employee_approver_user_id, manager_approver_kind, manager_approver_user_id, default_support_manager_id",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        company_id: string;
        employee_approver_kind: EmployeeApproverKind;
        employee_approver_user_id: string | null;
        manager_approver_kind: ManagerApproverKind;
        manager_approver_user_id: string | null;
        default_support_manager_id: string | null;
      } | null;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["company-members-lite", companyId],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", companyId);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [] as { id: string; full_name: string | null }[];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return data ?? [];
    },
  });

  const [empKind, setEmpKind] = useState<EmployeeApproverKind>("manager");
  const [empUser, setEmpUser] = useState<string>("");
  const [mgrKind, setMgrKind] = useState<ManagerApproverKind>("owner");
  const [mgrUser, setMgrUser] = useState<string>("");
  const [supportUser, setSupportUser] = useState<string>("");

  useEffect(() => {
    if (settings) {
      setEmpKind(settings.employee_approver_kind);
      setEmpUser(settings.employee_approver_user_id ?? "");
      setMgrKind(settings.manager_approver_kind);
      setMgrUser(settings.manager_approver_user_id ?? "");
      setSupportUser(settings.default_support_manager_id ?? "");
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: companyId,
        employee_approver_kind: empKind,
        employee_approver_user_id: empKind === "specific_user" ? empUser || null : null,
        manager_approver_kind: mgrKind,
        manager_approver_user_id: mgrKind === "specific_user" ? mgrUser || null : null,
        default_support_manager_id: supportUser || null,
      };
      const { error } = await (supabase as any)
        .from("company_hr_settings")
        .upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações de RH salvas");
      qc.invalidateQueries({ queryKey: ["hr-settings", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-lg font-semibold">Configurações de RH</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Defina quem aprova as solicitações de férias.
      </p>

      {isLoading ? (
        <div className="mt-4 text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Aprovador padrão — Funcionários</Label>
            <Select value={empKind} onValueChange={(v) => setEmpKind(v as EmployeeApproverKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Gestor</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="owner">Owner / Proprietário</SelectItem>
                <SelectItem value="specific_user">Usuário específico</SelectItem>
              </SelectContent>
            </Select>
            {empKind === "specific_user" && (
              <Select value={empUser || "none"} onValueChange={(v) => setEmpUser(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Escolha um usuário" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Escolha um usuário</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Aprovador — Gestores</Label>
            <Select value={mgrKind} onValueChange={(v) => setMgrKind(v as ManagerApproverKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner / Proprietário</SelectItem>
                <SelectItem value="other_manager">Outro gestor</SelectItem>
                <SelectItem value="specific_user">Usuário específico</SelectItem>
                <SelectItem value="self_allowed">Autoaprovação permitida</SelectItem>
              </SelectContent>
            </Select>
            {mgrKind === "specific_user" && (
              <Select value={mgrUser || "none"} onValueChange={(v) => setMgrUser(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Escolha um usuário" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Escolha um usuário</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Responsável padrão do Suporte</Label>
            <Select
              value={supportUser || "none"}
              onValueChange={(v) => setSupportUser(v === "none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Não definido" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definido</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Recebe as notificações de tickets da empresa quando o ticket ainda não tem
              responsável atribuído. É sempre um único destinatário.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          Salvar configurações
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Funcionário nunca se autoaprova. Gestor só se "Autoaprovação permitida" estiver selecionado.
      </p>
    </div>
  );
}