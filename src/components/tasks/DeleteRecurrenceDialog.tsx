/**
 * OmniBiz — Exclusão segura de ocorrências recorrentes (ADR-051).
 *
 * Apenas escolha de âmbito: "Apenas esta" ou "Esta e todas as futuras".
 * Toda a regra (soft-delete, cancelamento de ocorrências com histórico,
 * encerramento da série e auditoria) vive na RPC `task_series_delete`.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarX, Repeat, Trash2 } from "lucide-react";
import { STATUS_LABELS, deleteTaskSeries, isOpenPunchError, type DeleteSeriesScope, type TaskRow } from "@/lib/tasks";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";
import { cn } from "@/lib/utils";

export function DeleteRecurrenceDialog({
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
  onOpenPunch?: () => void;
}) {
  const [scope, setScope] = useState<DeleteSeriesScope>("single");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setScope("single");
      setReason("");
    }
  }, [open, task?.id]);

  const dateLabel = task
    ? task.scheduled_for
      ? `${formatWallDate(task.scheduled_for)} · ${formatWallTime(task.scheduled_for)}`
      : `${formatWallDate(task.recurrence_date ?? task.due_at) || "Sem data"} · Sem horário definido`
    : "";

  const submit = async () => {
    if (!task) return;
    setSaving(true);
    try {
      const res = await deleteTaskSeries(task.id, scope, reason);
      const parts: string[] = [];
      if (res.deleted > 0) parts.push(`${res.deleted} excluída(s)`);
      if (res.cancelled > 0) parts.push(`${res.cancelled} cancelada(s) por terem histórico`);
      if (res.kept > 0) parts.push(`${res.kept} preservada(s)`);
      toast.success(
        scope === "single"
          ? `Ocorrência removida${parts.length ? ` — ${parts.join(", ")}` : ""}.`
          : `Série encerrada${parts.length ? ` — ${parts.join(", ")}` : ""}. As ocorrências passadas foram preservadas.`,
      );
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

  const options: { value: DeleteSeriesScope; title: string; description: string; icon: typeof Trash2 }[] = [
    {
      value: "single",
      title: "Apenas esta ocorrência",
      description: "Remove só este dia. A série continua ativa e o sistema não voltará a gerar esta data.",
      icon: CalendarX,
    },
    {
      value: "future",
      title: "Esta e todas as futuras",
      description: "Remove esta e as próximas ocorrências e encerra a série. As passadas ficam intactas.",
      icon: Repeat,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent size="md">
        <ModalHeader
          icon={Trash2}
          title="Excluir tarefa recorrente"
          description="Esta tarefa pertence a uma série. Escolha o alcance da exclusão."
        />
        <ModalBody className="space-y-4">
          <ModalSection title={task?.title ?? "Tarefa"} description={clientName}>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>{dateLabel}</div>
              <div>Status atual: {task ? STATUS_LABELS[task.status] : "-"}</div>
            </div>
          </ModalSection>

          <div className="space-y-2">
            {options.map((opt) => {
              const Icon = opt.icon;
              const active = scope === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border bg-card/60 hover:bg-muted/50",
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{opt.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{opt.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Registado na auditoria e no cancelamento de ocorrências com histórico."
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Ocorrências com ponto, documentos ou fotos nunca são apagadas: ficam canceladas com o histórico preservado.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={saving} onClick={submit}>
            {saving ? "Aguarde..." : scope === "single" ? "Excluir esta" : "Excluir esta e futuras"}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
