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
import {
  ABSENCE_REASONS,
  ABSENCE_REASON_VACATION,
  STATUS_LABELS,
  isOpenPunchError,
  markTaskAbsent,
  updateTaskAbsence,
  type TaskRow,
} from "@/lib/tasks";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";
import { tr } from "@/i18n";

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
  // SUP-158: falta registada como férias (motivo "Férias", sempre justificada).
  const isVacation = finalReason === ABSENCE_REASON_VACATION;
  const valid = finalReason.length > 0;

  const submit = async () => {
    if (!task || !valid) return;
    setSaving(true);
    try {
      if (mode === "edit") await updateTaskAbsence(task.id, finalReason, justified);
      else await markTaskAbsent(task.id, finalReason, justified);
      toast.success(
        mode === "edit" ? "Falta atualizada." : justified ? "Falta justificada registada." : "Falta registada.",
      );
      onDone();
      onOpenChange(false);
    } catch (e) {
      if (isOpenPunchError(e)) {
        toast.error(tr("Existe um ponto aberto nesta tarefa. Encerre ou regularize o ponto antes de marcar falta."));
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
          title={mode === "edit" ? tr("Editar falta") : tr("Marcar falta")}
          description={
            mode === "edit"
              ? tr("Altere o motivo ou a classificação. A edição fica registada no histórico.")
              : tr("A falta exige motivo e fica registada no histórico da tarefa e do funcionário.")
          }
        />

        <ModalBody className="space-y-4">
          <ModalSection title={task?.title ?? tr("Tarefa")} description={clientName}>
            <div className="space-y-1 text-xs text-muted-foreground">
              {employeeName && <div>{tr("Funcionário:")} {employeeName}</div>}
              <div>{dateLabel}</div>
              <div>{tr("Status atual:")} {task ? tr(STATUS_LABELS[task.status]) : "-"}</div>
              {task?.absence_reason && <div>{tr("Falta já registada:")} {task.absence_reason}</div>}
            </div>
          </ModalSection>

          {mode === "edit" ? (
            <div className="space-y-1.5">
              <Label htmlFor="absence-edit-reason">{tr("Motivo da falta *")}</Label>
              <Textarea
                id="absence-edit-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={tr("Explique o motivo da falta")}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{tr("Motivo da falta *")}</Label>
              <Select
                value={reason}
                onValueChange={(r) => {
                  setReason(r);
                  if (r === ABSENCE_REASON_VACATION) setJustified(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("Selecione o motivo")} />
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
              <Label>{tr("Descreva o motivo *")}</Label>
              <Textarea
                value={other}
                onChange={(e) => setOther(e.target.value)}
                rows={3}
                placeholder={tr("Explique o motivo da falta")}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{tr("Classificação")}</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={justified ? "outline" : "default"}
                onClick={() => {
                  setJustified(false);
                  if (isVacation) setReason("");
                }}
              >
                {tr("Injustificada")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={justified && !isVacation ? "default" : "outline"}
                onClick={() => {
                  setJustified(true);
                  if (isVacation) setReason("");
                }}
              >
                {tr("Justificada")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={justified && isVacation ? "default" : "outline"}
                onClick={() => {
                  setJustified(true);
                  setReason(ABSENCE_REASON_VACATION);
                }}
              >
                {tr("Férias")}
              </Button>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            {tr("Voltar")}
          </Button>
          <Button variant="destructive" disabled={saving || !valid} onClick={submit}>
            {saving ? tr("Guardando...") : mode === "edit" ? tr("Guardar alterações") : tr("Confirmar falta")}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
