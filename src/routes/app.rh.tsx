import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  AlertTriangle,
  CalendarClock,
  FileWarning,
  Plane,
  Receipt,
  UserPlus,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/app/rh")({
  component: DashboardRH,
});

type DocRow = {
  profile_id: string;
  full_name: string | null;
  doc_type: string;
  expires_at: string;
  days_left: number;
};

const DOC_LABEL: Record<string, string> = {
  main_doc: "Documento principal (CC/TR)",
  a1: "A1",
  driver_license: "Carta de condução",
  passport: "Passaporte",
  health_card: "Cartão de saúde",
  occ_health: "Medicina do trabalho",
};

function daysBetween(iso: string) {
  const ms = new Date(iso + "T00:00:00").getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function DashboardRH() {
  const { currentCompanyId, initialized } = useAuth();
  const enabled = initialized && !!currentCompanyId;

  const { data: docs } = useQuery({
    queryKey: ["rh-docs", currentCompanyId],
    enabled,
    queryFn: async (): Promise<DocRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, main_doc_expires_at, a1_expires_at, driver_license_expires_at, passport_expires_at, health_card_expires_at, occ_health_next_at",
        )
        .eq("company_id_primary", currentCompanyId!);
      if (error) throw error;
      const rows: DocRow[] = [];
      for (const p of data ?? []) {
        const map: Array<[string, string | null]> = [
          ["main_doc", (p as any).main_doc_expires_at],
          ["a1", (p as any).a1_expires_at],
          ["driver_license", (p as any).driver_license_expires_at],
          ["passport", (p as any).passport_expires_at],
          ["health_card", (p as any).health_card_expires_at],
          ["occ_health", (p as any).occ_health_next_at],
        ];
        for (const [doc_type, exp] of map) {
          if (!exp) continue;
          const d = daysBetween(exp);
          if (d <= 90)
            rows.push({
              profile_id: p.id,
              full_name: (p as any).full_name ?? null,
              doc_type,
              expires_at: exp,
              days_left: d,
            });
        }
      }
      return rows.sort((a, b) => a.days_left - b.days_left);
    },
  });

  const { data: vacationsPending } = useQuery({
    queryKey: ["rh-vac", currentCompanyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("id, user_id, start_date, end_date, status")
        .eq("company_id", currentCompanyId!)
        .in("status", ["pendente", "pendente_confirmacao"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payslipsPending } = useQuery({
    queryKey: ["rh-pay", currentCompanyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("id, employee_name_detected, period_month, period_year, status")
        .eq("company_id", currentCompanyId!)
        .in("status", ["unassigned", "failed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invitesPending } = useQuery({
    queryKey: ["rh-inv", currentCompanyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, role, expires_at")
        .eq("company_id", currentCompanyId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!currentCompanyId) {
    return (
      <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5">
        Selecione uma empresa operacional para ver o Dashboard RH.
      </div>
    );
  }

  const docs90 = docs ?? [];
  const docsCritical = docs90.filter((d) => d.days_left <= 30).length;
  const totalActions =
    (vacationsPending?.length ?? 0) +
    docs90.length +
    (payslipsPending?.length ?? 0) +
    (invitesPending?.length ?? 0);

  const summary = [
    {
      label: "Férias pendentes",
      value: vacationsPending?.length ?? 0,
      icon: Plane,
      tone: "text-info",
      to: "/app/ferias",
    },
    {
      label: "Documentos a vencer",
      value: docs90.length,
      icon: FileWarning,
      tone: docsCritical ? "text-destructive" : "text-warning",
      to: "/app/equipe",
    },
    {
      label: "Recibos pendentes",
      value: payslipsPending?.length ?? 0,
      icon: Receipt,
      tone: "text-primary",
      to: "/app/rh/recibos",
    },
    {
      label: "Convites em aberto",
      value: invitesPending?.length ?? 0,
      icon: UserPlus,
      tone: "text-success",
      to: "/app/equipe",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Dashboard RH</h1>
        <p className="mt-1 text-muted-foreground">
          {totalActions} ação(ões) pendente(s) consolidada(s).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summary.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className={`h-4 w-4 ${c.tone}`} />
            </div>
            <div className="mt-3 font-display text-3xl font-semibold">{c.value}</div>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card p-6">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-warning" />
            <h2 className="font-display text-lg font-semibold">
              Documentos próximos do vencimento
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">≤ 90 dias</span>
        </header>
        {docs90.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum documento próximo do vencimento.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {docs90.slice(0, 10).map((d) => (
              <li key={`${d.profile_id}-${d.doc_type}`} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{d.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {DOC_LABEL[d.doc_type] ?? d.doc_type} ·{" "}
                    {new Date(d.expires_at + "T00:00:00").toLocaleDateString("pt-PT")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      d.days_left <= 30
                        ? "bg-destructive/10 text-destructive"
                        : d.days_left <= 60
                        ? "bg-warning/10 text-warning"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {d.days_left <= 0 ? "vencido" : `${d.days_left}d`}
                  </span>
                  <Link
                    to="/app/equipe"
                    className="text-xs text-primary hover:underline inline-flex items-center"
                  >
                    abrir <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <header className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Ações RH pendentes</h2>
        </header>
        <div className="grid gap-6 md:grid-cols-2">
          <PendingList
            title="Férias"
            to="/app/ferias"
            empty="Sem férias pendentes."
            items={(vacationsPending ?? []).slice(0, 5).map((v) => ({
              key: v.id,
              primary: `${new Date(v.start_date + "T00:00:00").toLocaleDateString("pt-PT")} → ${new Date(
                v.end_date + "T00:00:00",
              ).toLocaleDateString("pt-PT")}`,
              secondary: v.status,
            }))}
          />
          <PendingList
            title="Recibos"
            to="/app/rh/recibos"
            empty="Sem recibos pendentes."
            items={(payslipsPending ?? []).slice(0, 5).map((p) => ({
              key: p.id,
              primary: p.employee_name_detected ?? "Recibo não atribuído",
              secondary: `${p.period_month ?? "?"}/${p.period_year ?? "?"} · ${p.status}`,
            }))}
          />
          <PendingList
            title="Convites"
            to="/app/equipe"
            empty="Sem convites em aberto."
            items={(invitesPending ?? []).slice(0, 5).map((i) => ({
              key: i.id,
              primary: i.email,
              secondary: `${i.role} · expira ${new Date(i.expires_at).toLocaleDateString("pt-PT")}`,
            }))}
          />
          <PendingList
            title="Documentos"
            to="/app/equipe"
            empty="Sem documentos a vencer."
            items={docs90.slice(0, 5).map((d) => ({
              key: `${d.profile_id}-${d.doc_type}`,
              primary: d.full_name ?? "—",
              secondary: `${DOC_LABEL[d.doc_type] ?? d.doc_type} · ${
                d.days_left <= 0 ? "vencido" : `${d.days_left} dias`
              }`,
            }))}
          />
        </div>
      </section>
    </div>
  );
}

function PendingList({
  title,
  to,
  empty,
  items,
}: {
  title: string;
  to: string;
  empty: string;
  items: Array<{ key: string; primary: string; secondary: string }>;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link to={to} className="text-xs text-primary hover:underline inline-flex items-center">
          ver tudo <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.key} className="py-2">
              <div className="text-sm">{it.primary}</div>
              <div className="text-xs text-muted-foreground">{it.secondary}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}