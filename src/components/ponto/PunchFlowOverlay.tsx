import { useState, useEffect } from "react";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Send, ShieldAlert, CheckCircle2 } from "lucide-react";
import type { PunchFlowState } from "@/hooks/use-punch-flow";

const PHASE_LABEL: Record<PunchFlowState["phase"], string> = {
  idle: "",
  capturing_gps: "Obtendo localização…",
  sending: "Registrando ponto…",
  awaiting_reason: "Aguardando justificativa…",
  resending: "Reenviando com justificativa…",
  done: "Concluído.",
  failed: "Erro ao registrar.",
};

export function PunchFlowOverlay({
  state,
  onSubmit,
  onCancel,
}: {
  state: PunchFlowState;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (state.phase !== "awaiting_reason") setReason("");
  }, [state.phase]);

  const showProgress =
    state.phase === "capturing_gps" ||
    state.phase === "sending" ||
    state.phase === "resending";

  return (
    <>
      {/* Indicador de progresso — não bloqueia clique */}
      {showProgress && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg"
        >
          <span className="inline-flex items-center gap-2">
            {state.phase === "capturing_gps" ? (
              <MapPin className="h-4 w-4 animate-pulse text-primary" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
            {PHASE_LABEL[state.phase]}
          </span>
        </div>
      )}

      {/* Toast leve de sucesso */}
      {state.phase === "done" && state.lastCode && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 shadow">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> {state.lastCode}
          </span>
        </div>
      )}

      {/* Modal de justificativa */}
      <Dialog
        open={state.phase === "awaiting_reason"}
        onOpenChange={(o) => {
          if (!o) onCancel();
        }}
      >
        <DialogContent size="sm">
          <ModalHeader
            icon={ShieldAlert}
            title="Justificativa necessária"
            description={
              state.needsReasonMessage ??
              "A política da empresa exige uma justificativa para prosseguir."
            }
          />
          <ModalBody>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Textarea
                autoFocus
                maxLength={500}
                rows={4}
                placeholder="Ex.: cliente em obra vizinha, sem sinal GPS, etc."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={reason.trim().length < 3 || state.phase !== "awaiting_reason"}
              onClick={() => onSubmit(reason.trim())}
            >
              <Send className="mr-2 h-4 w-4" /> Enviar
            </Button>
          </ModalFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}