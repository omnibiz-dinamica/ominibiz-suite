import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleGuard } from "@/components/RoleGuard";

export const Route = createFileRoute("/app/empresa")({
  component: () => (
    <RoleGuard allow={["manager", "super_admin"]}>
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