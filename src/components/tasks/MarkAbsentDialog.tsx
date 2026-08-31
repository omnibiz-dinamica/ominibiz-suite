/**
 * OmniBiz — Registo formal de falta (ADR-044 · SUP-2026-000073).
 *
 * O funcionário responsável ou o gestor marca a falta numa tarefa com motivo obrigatório e
 * classificação (justificada / injustificada). Toda a regra vive na RPC
 * `task_mark_absent`; ponto aberto bloqueia e encaminha para a Recuperação de
 * Ponto Aberto.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserX } from "lucide-react";
import { ABSENCE_REASONS, STATUS_LABELS, isOpenPunchError, markTaskAbsent, updateTaskAbsence, type TaskRow } from "@/lib/tasks";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";

export function MarkAbsentDialog({
  task,
  employeeName,
  clientName,
  open,
  onOpenChange,
  onDone,
  onOpenPunch,
  mode = "create",
}: {
  task: TaskRow | null;
  employeeName?: string;
  clientName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  onOpenPunch?: () => void;
  mode?: "create" | "edit";
}) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [justified, setJustified] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setOther("");
      setJustified(mode === "edit" ? task?.absence_justified === true : false);
      if (mode === "edit" && task?.absence_reason) setReason(task.absence_reason);
    }
  }, [open, task?.id, mode, task?.absence_reason, task?.absence_justified]);

  const finalReason = mode === "edit" ? reason.trim() : reason === "Outro" ? other.trim() : reason;
  const valid = finalReason.length > 0;

  const submit = async () => {
    if (!task || !valid) return;
    setSaving(true);
    try {
      if (mode === "edit") await updateTaskAbsence(task.id, finalReason, justified);
      else await markTaskAbsent(task.id, finalReason, justified);
      toast.success(mode === "edit" ? "Falta atualizada." : justified ? "Falta justificada registada." : "Falta registada.");
      onDone();
      onOpenChange(false);
    } catch (e) {
      if (isOpenPunchError(e)) {
        toast.error("Existe um ponto aberto nesta tarefa. Encerre ou regularize o ponto antes de marcar falta.");
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
          icon={UserX}
            title={mode === "edit" ? "Editar falta" : "Marcar falta"}
            description={mode === "edit" ? "Altere o motivo ou a classificação. A edição fica registada no histórico." : "A falta exige motivo e fica registada no histórico da tarefa e do funcionário."}
        />

        <ModalBody className="space-y-4">
          <ModalSection title={task?.title ?? "Tarefa"} description={clientName}>
            <div className="space-y-1 text-xs text-muted-foreground">
              {employeeName && <div>Funcionário: {employeeName}</div>}
              <div>{dateLabel}</div>
              <div>Status atual: {task ? STATUS_LABELS[task.status] : "-"}</div>
              {task?.absence_reason && <div>Falta já registada: {task.absence_reason}</div>}
            </div>
          </ModalSection>

          {mode === "edit" ? (
            <div className="space-y-1.5">
              <Label htmlFor="absence-edit-reason">Motivo da falta *</Label>
              <Textarea id="absence-edit-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Explique o motivo da falta" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Motivo da falta *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {reason === "Outro" && (
            <div className="space-y-1.5">
              <Label>Descreva o motivo *</Label>
              <Textarea
                value={other}
                onChange={(e) => setOther(e.target.value)}
                rows={3}
                placeholder="Explique o motivo da falta"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Classificação</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={justified ? "outline" : "default"}
                onClick={() => setJustified(false)}
              >
                Injustificada
              </Button>
              <Button
                type="button"
                size="sm"
                variant={justified ? "default" : "outline"}
                onClick={() => setJustified(true)}
              >
                Justificada
              </Button>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button variant="destructive" disabled={saving || !valid} onClick={submit}>
              {saving ? "Guardando..." : mode === "edit" ? "Guardar alterações" : "Confirmar falta"}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
