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

/** Outro funcionário da mesma tarefa em equipa (mesmo task_group_id e mesmo dia). */
export type GroupMate = { taskId: string; name: string; disabled?: boolean; note?: string };

/**
 * Lista de colegas da mesma tarefa para o gestor escolher quem também sai.
 * Por padrão nenhum colega é marcado: só o funcionário da linha clicada é excluído.
 */
export function GroupMatesPicker({
  mates,
  selected,
  onChange,
  currentName,
}: {
  mates: GroupMate[];
  selected: string[];
  onChange: (ids: string[]) => void;
  currentName?: string;
}) {
  if (mates.length === 0) return null;
  const selectable = mates.filter((m) => !m.disabled).map((m) => m.taskId);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));
  const toggle = (id: string, on: boolean) =>
    onChange(on ? Array.from(new Set([...selected, id])) : selected.filter((x) => x !== id));
  return (
    <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-left">
      <div className="text-sm font-medium">
        Esta tarefa tem mais {mates.length} {mates.length === 1 ? "funcionário" : "funcionários"}
      </div>
      <p className="text-xs text-muted-foreground">
        {currentName ? `${currentName} será excluído(a). ` : ""}Marque quem também deve sair desta tarefa. Os não
        marcados continuam com a tarefa.
      </p>
      {selectable.length > 1 && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={allSelected}
            onChange={(e) => onChange(e.target.checked ? selectable : [])}
          />
          Todos
        </label>
      )}
      <div className="space-y-1.5">
        {mates.map((m) => (
          <label key={m.taskId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              disabled={m.disabled}
              checked={selected.includes(m.taskId)}
              onChange={(e) => toggle(m.taskId, e.target.checked)}
            />
            <span className={m.disabled ? "text-muted-foreground" : ""}>{m.name}</span>
            {m.note && <span className="text-xs text-muted-foreground">({m.note})</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

export function DeleteRecurrenceDialog({
  task,
  clientName,
  open,
  onOpenChange,
  onDone,
  onOpenPunch,
  groupMates = [],
  currentName,
}: {
  task: TaskRow | null;
  clientName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  onOpenPunch?: () => void;
  /** Colegas da mesma tarefa em equipa no mesmo dia; o mesmo âmbito é aplicado aos marcados. */
  groupMates?: GroupMate[];
  currentName?: string;
}) {
  const [scope, setScope] = useState<DeleteSeriesScope>("single");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedMates, setSelectedMates] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setScope("single");
      setReason("");
      setSelectedMates([]);
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
      // Mesmo âmbito para cada colega marcado (cada um tem a sua própria série).
      const mateFailures: string[] = [];
      for (const mateTaskId of selectedMates) {
        try {
          const r = await deleteTaskSeries(mateTaskId, scope, reason);
          res.deleted += r.deleted;
          res.cancelled += r.cancelled;
          res.kept += r.kept;
        } catch (mateError) {
          mateFailures.push((mateError as Error).message);
        }
      }
      if (mateFailures.length > 0) {
        toast.warning(
          `${mateFailures.length} funcionário(s) não puderam ser excluídos desta tarefa: ${mateFailures[0]}`,
        );
      }
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

          <GroupMatesPicker
            mates={groupMates}
            selected={selectedMates}
            onChange={setSelectedMates}
            currentName={currentName}
          />

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
