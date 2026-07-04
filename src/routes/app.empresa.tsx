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
          "company_id, default_punch_mode, employee_approver_kind, employee_approver_user_id, manager_approver_kind, manager_approver_user_id",
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

  useEffect(() => {
    if (settings) {
      setEmpKind(settings.employee_approver_kind);
      setEmpUser(settings.employee_approver_user_id ?? "");
      setMgrKind(settings.manager_approver_kind);
      setMgrUser(settings.manager_approver_user_id ?? "");
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