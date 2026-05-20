import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatEUR, SERVICE_LABELS } from "@/lib/contract-vars";
import { generateContractPDF } from "@/lib/contract-pdf";
import { ArrowLeft, Download, Link as LinkIcon } from "lucide-react";

export const Route = createFileRoute("/app/comercial/contratos/$id")({
  component: ContractDetail,
});

const STEP_LABEL: Record<string, string> = {
  operational_assessment: "Avaliação operacional",
  platform_configuration: "Configuração da plataforma",
  ai_configuration: "Configuração de IA",
  integrations: "Integrações",
  testing: "Testes",
  training: "Formação",
  go_live: "Go Live",
};

function ContractDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["contract-detail", id],
    queryFn: async () => {
      const [{ data: c, error }, { data: svc }, { data: wf }, { data: inv }] = await Promise.all([
        supabase.from("contracts").select("*, client:commercial_clients(*)").eq("id", id).single(),
        supabase.from("contract_services").select("service").eq("contract_id", id),
        supabase.from("contract_workflow").select("*").eq("contract_id", id),
        supabase.from("invoices").select("*").eq("contract_id", id).order("due_date"),
      ]);
      if (error) throw error;
      return { c, svc: svc ?? [], wf: wf ?? [], inv: inv ?? [] };
    },
  });

  const setStep = useMutation({
    mutationFn: async ({ stepId, status }: { stepId: string; status: string }) => {
      const { error } = await supabase.from("contract_workflow")
        .update({ status: status as never, completed_at: status === "done" ? new Date().toISOString() : null })
        .eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract-detail", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data?.c) return <div className="text-sm text-muted-foreground">A carregar…</div>;
  const c = data.c as unknown as {
    id: string; plan_name: string; monthly_fee: number; credits_limit: number;
    status: string; sign_token: string | null; signer_name: string | null;
    signed_at: string | null; signed_ip: string | null; signature_hash: string | null;
    rendered_body: string | null; start_date: string;
    client: { company_name: string; nif: string | null } | null;
  };

  const downloadPDF = () => {
    const blob = generateContractPDF({
      title: `Contrato — ${c.client?.company_name ?? ""}`,
      body: c.rendered_body ?? "",
      signature: c.signed_at ? {
        name: c.signer_name ?? "",
        signedAt: new Date(c.signed_at).toLocaleString("pt-PT"),
        ip: c.signed_ip ?? undefined,
        hash: c.signature_hash ?? undefined,
      } : undefined,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `contrato-${c.id.slice(0, 8)}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const copyLink = () => {
    if (!c.sign_token) return;
    navigator.clipboard.writeText(`${window.location.origin}/sign/${c.sign_token}`);
    toast.success("Link copiado");
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/comercial/contratos"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
      </Button>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">{c.client?.company_name}</h2>
            <p className="text-sm text-muted-foreground">Plano {c.plan_name} · {formatEUR(c.monthly_fee)}/mês · {c.credits_limit} créditos</p>
            <p className="mt-1 text-xs text-muted-foreground">Estado: <strong>{c.status}</strong> · Início {c.start_date}</p>
          </div>
          <div className="flex gap-2">
            {c.sign_token && (c.status === "draft" || c.status === "sent") && (
              <Button variant="outline" size="sm" onClick={copyLink}><LinkIcon className="mr-1 h-4 w-4" /> Copiar link</Button>
            )}
            <Button size="sm" onClick={downloadPDF}><Download className="mr-1 h-4 w-4" /> PDF</Button>
          </div>
        </div>
        {c.signed_at && (
          <div className="mt-4 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
            Assinado por <strong>{c.signer_name}</strong> em {new Date(c.signed_at).toLocaleString("pt-PT")}
            {c.signed_ip ? ` · IP ${c.signed_ip}` : ""}
            {c.signature_hash ? ` · hash ${c.signature_hash.slice(0, 16)}…` : ""}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {data.svc.map((s) => (
            <span key={s.service} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
              {SERVICE_LABELS[s.service]}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-display text-lg font-semibold">Onboarding</h3>
        {data.wf.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">O fluxo será criado automaticamente após a assinatura.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.wf.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-sm">{STEP_LABEL[w.step] ?? w.step}</div>
                  <div className="text-xs text-muted-foreground">{w.status}{w.completed_at ? ` · ${new Date(w.completed_at).toLocaleDateString("pt-PT")}` : ""}</div>
                </div>
                <div className="flex gap-1">
                  {w.status !== "in_progress" && <Button size="sm" variant="ghost" onClick={() => setStep.mutate({ stepId: w.id, status: "in_progress" })}>Iniciar</Button>}
                  {w.status !== "done" && <Button size="sm" variant="outline" onClick={() => setStep.mutate({ stepId: w.id, status: "done" })}>Concluir</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-display text-lg font-semibold">Faturas</h3>
        {data.inv.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Sem faturas registadas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.inv.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span>{i.reference ?? i.id.slice(0, 8)} · vence {i.due_date}</span>
                <span>{formatEUR(i.amount)} · {i.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}