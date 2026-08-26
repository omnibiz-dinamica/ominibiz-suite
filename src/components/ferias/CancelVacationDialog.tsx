/**
 * OmniBiz — Cancelamento explícito e auditado de férias (ADR-046).
 *
 * O cancelamento de um pedido de férias nunca pode acontecer com um clique
 * único nem como efeito colateral de abrir/fechar ecrãs. Este diálogo exige:
 * confirmação em dois passos, identificação do funcionário e do período, e
 * motivo obrigatório — registado em `vacation_audit` pela RPC `vacation_decide`.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CalendarX } from "lucide-react";

export type VacationCancelTarget = {
  id: string;
  employeeName: string;
  periodLabel: string;
  statusLabel: string;
};

export function CancelVacationDialog({
  target,
  open,
  onOpenChange,
  onConfirm,
  saving,
}: {
  target: VacationCancelTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (id: string, reason: string) => void;
  saving?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setConfirming(false);
    }
  }, [open, target?.id]);

  const finalReason = reason.trim();
  const valid = finalReason.length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <ModalHeader
          icon={CalendarX}
          title="Cancelar férias"
          description="Ação explícita e auditada — exige motivo e confirmação final."
        />

        <ModalBody className="space-y-4">
          <ModalSection title={target?.employeeName ?? "Funcionário"} description={target?.periodLabel}>
            <div className="text-xs text-muted-foreground">Status atual: {target?.statusLabel ?? "-"}</div>
          </ModalSection>

          {!confirming ? (
            <div className="space-y-1.5">
              <Label>Motivo do cancelamento *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Explique porque este pedido de férias será cancelado"
              />
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <div className="font-medium">Confirmar o cancelamento deste pedido?</div>
                <div className="text-xs">
                  {target?.employeeName} · {target?.periodLabel}
                </div>
                <div className="text-xs text-muted-foreground">
                  Fica registado quem cancelou, quando e o motivo. O histórico é preservado.
                </div>
                <div className="text-xs">Motivo: {finalReason}</div>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          {!confirming ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Voltar
              </Button>
              <Button disabled={!valid} onClick={() => setConfirming(true)}>
                Continuar
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" disabled={saving} onClick={() => setConfirming(false)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                disabled={saving || !target}
                onClick={() => target && onConfirm(target.id, finalReason)}
              >
                {saving ? "Cancelando..." : "Confirmar cancelamento"}
              </Button>
            </>
          )}
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
