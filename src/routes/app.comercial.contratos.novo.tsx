import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { renderTemplate, formatEUR, SERVICE_LABELS, DEFAULT_TEMPLATE_BODY } from "@/lib/contract-vars";
import { randomToken } from "@/lib/contract-pdf";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

export const Route = createFileRoute("/app/comercial/contratos/novo")({
  component: WizardPage,
});

const STEPS = ["Cliente", "Plano", "Serviços", "Financeiro", "Revisão"];
const SERVICES = Object.keys(SERVICE_LABELS) as Array<keyof typeof SERVICE_LABELS>;

function WizardPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [planName, setPlanName] = useState("Starter");
  const [services, setServices] = useState<string[]>(["whatsapp", "dashboard"]);
  const [monthlyFee, setMonthlyFee] = useState("99");
  const [creditsLimit, setCreditsLimit] = useState("1000");
  const [promoMonths, setPromoMonths] = useState("0");
  const [promoFee, setPromoFee] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["wizard-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("commercial_clients").select("id,company_name,nif").order("company_name");
      return data ?? [];
    },
  });
  const { data: templates = [] } = useQuery({
    queryKey: ["wizard-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("contract_templates").select("id,name,body").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const client = clients.find((c) => c.id === clientId);
  const template = templates.find((t) => t.id === templateId);
  const templateBody = template?.body ?? DEFAULT_TEMPLATE_BODY;

  const rendered = useMemo(() => renderTemplate(templateBody, {
    company_name: client?.company_name ?? "—",
    nif: client?.nif ?? "—",
    plan_name: planName,
    monthly_fee: formatEUR(monthlyFee),
    credits_limit: creditsLimit,
    services: services.map((s) => `- ${SERVICE_LABELS[s]}`).join("\n"),
    start_date: startDate,
    promo_months: promoMonths,
    promo_fee: promoFee ? formatEUR(promoFee) : "—",
  }), [templateBody, client, planName, monthlyFee, creditsLimit, services, startDate, promoMonths, promoFee]);

  const create = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Selecione um cliente");
      const token = randomToken();
      const { data, error } = await supabase.from("contracts").insert({
        client_id: clientId,
        template_id: templateId || null,
        plan_name: planName,
        monthly_fee: Number(monthlyFee) || 0,
        credits_limit: Number(creditsLimit) || 0,
        promo_months: Number(promoMonths) || 0,
        promo_fee: promoFee ? Number(promoFee) : null,
        start_date: startDate,
        status: "sent",
        rendered_body: rendered,
        sign_token: token,
        sign_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        notes: notes || null,
      }).select("id").single();
      if (error) throw error;
      const contractId = data.id as string;
      if (services.length) {
        const rows = services.map((s) => ({ contract_id: contractId, service: s as never }));
        await supabase.from("contract_services").insert(rows);
      }
      return { id: contractId, token };
    },
    onSuccess: ({ id, token }) => {
      const url = `${window.location.origin}/sign/${token}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Contrato criado", { description: "Link de assinatura copiado." });
      nav({ to: "/app/comercial/contratos/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext = () => {
    if (step === 0) return !!clientId;
    if (step === 1) return planName.trim().length > 0;
    if (step === 2) return services.length > 0;
    if (step === 3) return Number(monthlyFee) >= 0;
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Novo contrato</h2>
        <div className="text-sm text-muted-foreground">Passo {step + 1} de {STEPS.length}</div>
      </div>

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className={`flex-1 rounded-full h-1.5 ${i <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        {step === 0 && (
          <div className="space-y-3">
            <Label>Cliente</Label>
            {clients.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center">
                <p className="text-sm font-medium">Nenhum cliente encontrado.</p>
                <p className="mt-1 text-xs text-muted-foreground">Crie um cliente antes de gerar um contrato.</p>
                <Button asChild className="mt-3" size="sm">
                  <Link to="/app/comercial/clientes">Criar cliente</Link>
                </Button>
              </div>
            ) : (
              <>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}{c.nif ? ` · ${c.nif}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Não vê o cliente? Crie em Comercial → Clientes.</p>
              </>
            )}
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Usar template padrão" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Nome do plano</Label><Input value={planName} onChange={(e) => setPlanName(e.target.value)} /></div>
            <div><Label>Início de vigência</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-2 md:grid-cols-2">
            {SERVICES.map((s) => (
              <label key={s} className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Checkbox checked={services.includes(s)} onCheckedChange={(v) => {
                  setServices(v ? [...services, s] : services.filter((x) => x !== s));
                }} />
                <span>{SERVICE_LABELS[s]}</span>
              </label>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Mensalidade (€)</Label><Input type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} /></div>
            <div><Label>Limite de créditos IA / mês</Label><Input type="number" value={creditsLimit} onChange={(e) => setCreditsLimit(e.target.value)} /></div>
            <div><Label>Meses promocionais</Label><Input type="number" value={promoMonths} onChange={(e) => setPromoMonths(e.target.value)} /></div>
            <div><Label>Valor promocional (€)</Label><Input type="number" value={promoFee} onChange={(e) => setPromoFee(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Notas internas</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background p-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Cliente:</span> {client?.company_name ?? "—"}</div>
                <div><span className="text-muted-foreground">Plano:</span> {planName}</div>
                <div><span className="text-muted-foreground">Mensalidade:</span> {formatEUR(monthlyFee)}</div>
                <div><span className="text-muted-foreground">Créditos:</span> {creditsLimit}</div>
                <div><span className="text-muted-foreground">Início:</span> {startDate}</div>
                <div><span className="text-muted-foreground">Promo:</span> {promoMonths} meses{promoFee ? ` · ${formatEUR(promoFee)}` : ""}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Serviços:</span> {services.map((s) => SERVICE_LABELS[s]).join(", ")}</div>
              </div>
            </div>
            <details className="rounded-lg border border-border bg-background p-4">
              <summary className="cursor-pointer text-sm font-medium">Pré-visualizar contrato</summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{rendered}</pre>
            </details>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
            Avançar <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => create.mutate()} disabled={create.isPending || !canNext()}>
            <Check className="mr-1 h-4 w-4" /> {create.isPending ? "A gerar…" : "Gerar contrato"}
          </Button>
        )}
      </div>
    </div>
  );
}