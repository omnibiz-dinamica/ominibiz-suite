import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatEUR } from "@/lib/contract-vars";
import { FileText, Users, CircleDollarSign, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/app/comercial/")({
  component: CommercialDashboard,
});

function CommercialDashboard() {
  const { data } = useQuery({
    queryKey: ["commercial-stats"],
    queryFn: async () => {
      const [clients, contracts] = await Promise.all([
        supabase.from("commercial_clients").select("id", { count: "exact", head: true }),
        supabase.from("contracts").select("id,status,monthly_fee"),
      ]);
      const rows = contracts.data ?? [];
      const byStatus: Record<string, number> = {};
      let mrr = 0;
      let signedCount = 0;
      rows.forEach((r) => {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        if (["active", "promo_period", "implementation"].includes(r.status)) {
          mrr += Number(r.monthly_fee ?? 0);
        }
        if (r.status !== "draft") signedCount += 1;
      });
      const total = rows.length;
      const conversion = total ? Math.round((signedCount / total) * 100) : 0;
      return {
        clientsTotal: clients.count ?? 0,
        contractsTotal: total,
        mrr,
        conversion,
        byStatus,
      };
    },
  });

  const cards = [
    { label: "Clientes comerciais", value: data?.clientsTotal ?? 0, icon: Users },
    { label: "Contratos totais", value: data?.contractsTotal ?? 0, icon: FileText },
    { label: "MRR estimado", value: formatEUR(data?.mrr ?? 0), icon: CircleDollarSign },
    { label: "Taxa de conversão", value: `${data?.conversion ?? 0}%`, icon: CheckCircle2 },
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
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 font-display text-3xl font-semibold">{c.value}</div>
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
    </div>
  );
}