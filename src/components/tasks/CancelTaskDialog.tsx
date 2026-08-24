/**
 * OmniBiz — Cancelamento auditado de tarefa (ADR-036).
 *
 * Motivo obrigatório + confirmação explícita. O cancelamento passa sempre pela
 * RPC `task_cancel` (gestor ou responsável), nunca por UPDATE livre em `tasks`.
 * Ponto aberto na tarefa bloqueia a operação e encaminha para a Recuperação de
 * Ponto Aberto.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Ban } from "lucide-react";
import { CANCEL_REASONS, STATUS_LABELS, cancelTask, isOpenPunchError, type TaskRow } from "@/lib/tasks";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";

export function CancelTaskDialog({
  task,
  clientName,
  open,
  onOpenChange,
  onDone,
  onOpenPunch,
}: {
  task: TaskRow | null;
  clientName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  /** Encaminhamento para o fluxo oficial de Recuperação de Ponto Aberto. */
  onOpenPunch?: () => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [other, setOther] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setOther("");
      setConfirming(false);
    }
  }, [open, task?.id]);

  const finalReason = reason === "Outro" ? other.trim() : reason;
  const valid = finalReason.length > 0;

  const submit = async () => {
    if (!task || !valid) return;
    setSaving(true);
    try {
      await cancelTask(task.id, finalReason);
      toast.success("Tarefa cancelada. O histórico foi preservado.");
      onDone();
      onOpenChange(false);
    } catch (e) {
      if (isOpenPunchError(e)) {
        toast.error("Existe um ponto aberto nesta tarefa. Encerre ou regularize o ponto antes de continuar.");
        onOpenChange(false);
        onOpenPunch?.();
      } else {
        toast.error((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = task
    ? task.scheduled_for
      ? `${formatWallDate(task.scheduled_for)} · ${formatWallTime(task.scheduled_for)}`
      : `${formatWallDate(task.recurrence_date ?? task.due_at) || "Sem data"} · Sem horário definido`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <ModalHeader
          icon={Ban}
          title="Cancelar tarefa"
          description="O cancelamento exige motivo e fica registado permanentemente no histórico."
        />

        <ModalBody className="space-y-4">
          <ModalSection title={task?.title ?? "Tarefa"} description={clientName}>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>{dateLabel}</div>
              <div>Status atual: {task ? STATUS_LABELS[task.status] : "-"}</div>
            </div>
          </ModalSection>

          {!confirming ? (
            <>
              <div className="space-y-1.5">
                <Label>Motivo do cancelamento *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {CANCEL_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {reason === "Outro" && (
                <div className="space-y-1.5">
                  <Label>Descreva o motivo *</Label>
                  <Textarea
                    value={other}
                    onChange={(e) => setOther(e.target.value)}
                    rows={3}
                    placeholder="Explique o motivo do cancelamento"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <div className="font-medium">Tem certeza de que deseja cancelar esta tarefa?</div>
                <div className="text-xs text-muted-foreground">O histórico será preservado.</div>
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
              <Button variant="destructive" disabled={saving} onClick={submit}>
                {saving ? "Cancelando..." : "Confirmar cancelamento"}
              </Button>
            </>
          )}
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
