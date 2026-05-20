import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatEUR } from "@/lib/contract-vars";
import { FileText, Users, CircleDollarSign, CheckCircle2, Clock, Send, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/app/comercial/")({
  component: CommercialDashboard,
});

function CommercialDashboard() {
  const { data } = useQuery({
    queryKey: ["commercial-stats"],
    queryFn: async () => {
      const in30 = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const [clients, contracts, events] = await Promise.all([
        supabase.from("commercial_clients").select("id", { count: "exact", head: true }),
        supabase.from("contracts").select("id,status,monthly_fee,end_date,client:commercial_clients(company_name)"),
        supabase.from("contract_audit_events").select("*").order("created_at", { ascending: false }).limit(10),
      ]);
      const rows = contracts.data ?? [];
      const byStatus: Record<string, number> = {};
      let mrr = 0;
      let signedCount = 0;
      let expiringSoon = 0;
      rows.forEach((r) => {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        if (["active", "promo_period", "implementation"].includes(r.status)) {
          mrr += Number(r.monthly_fee ?? 0);
        }
        if (r.status !== "draft") signedCount += 1;
        if (r.end_date && r.end_date <= in30 && ["active", "promo_period"].includes(r.status)) {
          expiringSoon += 1;
        }
      });
      return {
        clientsTotal: clients.count ?? 0,
        drafts: byStatus.draft ?? 0,
        sent: byStatus.sent ?? 0,
        signed: byStatus.signed ?? 0,
        active: byStatus.active ?? 0,
        mrr,
        expiringSoon,
        byStatus,
        events: events.data ?? [],
      };
    },
  });

  const cards = [
    { label: "Clientes", value: data?.clientsTotal ?? 0, icon: Users },
    { label: "Rascunhos", value: data?.drafts ?? 0, icon: FileText },
    { label: "Aguardando assinatura", value: data?.sent ?? 0, icon: Send },
    { label: "Assinados", value: data?.signed ?? 0, icon: CheckCircle2 },
    { label: "MRR contratado", value: formatEUR(data?.mrr ?? 0), icon: CircleDollarSign },
    { label: "Vencem em 30 dias", value: data?.expiringSoon ?? 0, icon: AlertTriangle },
  ];

  const statusOrder: Array<[string, string]> = [
    ["draft", "Rascunho"],
    ["sent", "Enviado"],
    ["signed", "Assinado"],
    ["implementation", "Implementação"],
    ["promo_period", "Período promo"],
    ["active", "Ativo"],
    ["suspended", "Suspenso"],
    ["cancelled", "Cancelado"],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 font-display text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Pipeline por estado</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {statusOrder.map(([k, label]) => (
            <div key={k} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {label}
              </div>
              <div className="mt-2 text-2xl font-semibold">{data?.byStatus?.[k] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Atividades recentes</h2>
        <div className="mt-4 space-y-2">
          {(data?.events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atividade recente.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {(data?.events ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                  <span className="font-medium">{e.event_type}</span>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-PT")}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
