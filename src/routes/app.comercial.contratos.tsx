import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatEUR } from "@/lib/contract-vars";
import { FilePlus2, Link as LinkIcon, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/comercial/contratos")({
  component: ContractsPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  signed: "Assinado",
  implementation: "Implementação",
  promo_period: "Período promo",
  active: "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};
const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-500",
  signed: "bg-purple-500/15 text-purple-500",
  implementation: "bg-amber-500/15 text-amber-500",
  promo_period: "bg-teal-500/15 text-teal-500",
  active: "bg-success/15 text-success",
  suspended: "bg-orange-500/15 text-orange-500",
  cancelled: "bg-destructive/15 text-destructive",
};

function ContractsPage() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) return <Outlet />;

  return <ContractsListPage />;
}

function ContractsListPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contracts-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select(
          "id, plan_name, monthly_fee, status, sign_token, created_at, client:commercial_clients(company_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("contracts")
        .update({ status: status as never })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado atualizado");
      qc.invalidateQueries({ queryKey: ["contracts-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = (token: string | null) => {
    if (!token) {
      toast.error("Contrato sem link de assinatura");
      return;
    }
    const url = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado", { description: url });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Contratos</h2>
        <Button asChild>
          <Link
            to="/app/comercial/contratos/novo"
            onClick={() => console.log("Novo contrato clicked")}
          >
            <FilePlus2 className="mr-2 h-4 w-4" /> Novo contrato
          </Link>
        </Button>
      </div>
      <div className="rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">A carregar…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhum contrato criado.</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => {
              type RowClient = { company_name: string } | null;
              const client = (c as unknown as { client: RowClient }).client;
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {client?.company_name ?? "—"} · {c.plan_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatEUR(c.monthly_fee)}/mês · criado{" "}
                      {new Date(c.created_at).toLocaleDateString("pt-PT")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        STATUS_TONE[c.status],
                      )}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                    {c.status === "signed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus.mutate({ id: c.id, status: "implementation" })}
                      >
                        Iniciar implementação
                      </Button>
                    )}
                    {c.status === "implementation" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus.mutate({ id: c.id, status: "active" })}
                      >
                        Ativar
                      </Button>
                    )}
                    {(c.status === "active" || c.status === "promo_period") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStatus.mutate({ id: c.id, status: "suspended" })}
                      >
                        Suspender
                      </Button>
                    )}
                    {c.sign_token && (c.status === "draft" || c.status === "sent") && (
                      <Button size="sm" variant="ghost" onClick={() => copyLink(c.sign_token)}>
                        <LinkIcon className="mr-1 h-4 w-4" /> Link
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/app/comercial/contratos/$id" params={{ id: c.id }}>
                        <Eye className="mr-1 h-4 w-4" /> Detalhe
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
