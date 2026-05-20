import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SignaturePad from "signature_pad";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatEUR } from "@/lib/contract-vars";
import { generateContractPDF, sha256Hex } from "@/lib/contract-pdf";
import { CheckCircle2, Download, Loader2 } from "lucide-react";

export const Route = createFileRoute("/sign/$token")({
  component: SignPage,
});

function SignPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [signerName, setSignerName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sign", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contract_sign_get", { _token: token });
      if (error) throw error;
      const row = (data ?? [])[0];
      if (!row) throw new Error("Contrato não encontrado.");
      return row;
    },
  });

  useEffect(() => {
    if (!canvasRef.current || data?.status !== "draft" && data?.status !== "sent") return;
    const canvas = canvasRef.current;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      padRef.current?.clear();
    };
    padRef.current = new SignaturePad(canvas, { backgroundColor: "rgba(255,255,255,0)", penColor: "#0f172a" });
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [data?.status]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!signerName.trim() || signerName.trim().length < 2) throw new Error("Informe o seu nome completo.");
      if (!padRef.current || padRef.current.isEmpty()) throw new Error("Assinatura obrigatória.");
      const image = padRef.current.toDataURL("image/png");
      const ua = navigator.userAgent;
      const hash = await sha256Hex(`${token}|${signerName}|${ua}|${image}|${Date.now()}`);
      const { error } = await supabase.rpc("contract_sign_submit", {
        _token: token,
        _signer_name: signerName.trim(),
        _user_agent: ua,
        _signature_hash: hash,
      });
      if (error) throw error;
    },
    onMutate: () => setSubmitting(true),
    onSettled: () => setSubmitting(false),
    onSuccess: () => {
      toast.success("Contrato assinado com sucesso.");
      qc.invalidateQueries({ queryKey: ["sign", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadPDF = () => {
    if (!data) return;
    const blob = generateContractPDF({
      title: `Contrato — ${data.client_name}`,
      body: data.rendered_body ?? "",
      signature: data.signed_at ? {
        name: data.signer_name ?? "",
        signedAt: new Date(data.signed_at).toLocaleString("pt-PT"),
      } : undefined,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `contrato-${data.id.slice(0, 8)}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="font-display text-2xl font-semibold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link de assinatura não é válido ou já não está disponível.
          </p>
        </div>
      </div>
    );
  }

  const alreadySigned = data.status !== "draft" && data.status !== "sent";
  const expired = data.sign_expires_at && new Date(data.sign_expires_at) < new Date();

  return (
    <div className="min-h-screen bg-background py-8 text-foreground">
      <div className="mx-auto max-w-3xl px-4">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground font-display font-bold">
              O
            </div>
            <span className="font-display text-lg font-semibold">OmniBiz</span>
          </div>
          <Button variant="outline" size="sm" onClick={downloadPDF}>
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
        </header>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="font-display text-2xl font-semibold">Contrato — {data.client_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plano <strong>{data.plan_name}</strong> · {formatEUR(data.monthly_fee)}/mês · {data.credits_limit} créditos
          </p>
          {data.promo_months > 0 && data.promo_fee != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Promoção: {data.promo_months} meses a {formatEUR(data.promo_fee)}
            </p>
          )}
        </div>

        <article className="prose prose-sm dark:prose-invert mt-6 max-w-none whitespace-pre-wrap rounded-2xl border border-border bg-card p-6 leading-relaxed">
          {data.rendered_body ?? "Conteúdo do contrato indisponível."}
        </article>

        {alreadySigned ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-5 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
            <div>
              <div className="font-semibold text-foreground">Contrato já assinado</div>
              <div className="text-muted-foreground">
                Assinado por <strong>{data.signer_name}</strong>
                {data.signed_at ? ` em ${new Date(data.signed_at).toLocaleString("pt-PT")}` : ""}.
              </div>
            </div>
          </div>
        ) : expired ? (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            Este link de assinatura expirou.
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Assinatura digital</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ao assinar, declara aceitar todas as condições deste contrato. Serão registados o seu IP, navegador e data da assinatura.
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="signer">Nome completo</Label>
                <Input id="signer" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Como assinatura legal" />
              </div>
              <div className="space-y-1">
                <Label>Assinatura</Label>
                <div className="rounded-lg border border-dashed border-border bg-background">
                  <canvas ref={canvasRef} className="h-40 w-full touch-none" />
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => padRef.current?.clear()}
                >
                  Limpar
                </button>
              </div>
              <Button className="w-full" disabled={submitting} onClick={() => submit.mutate()}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Assinar contrato
              </Button>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">© OmniBiz · documento gerado eletronicamente</p>
      </div>
    </div>
  );
}