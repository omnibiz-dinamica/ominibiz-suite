/**
 * OmniBiz — Arquivamento manual de tarefa (ADR-036).
 *
 * "Arquivado" é dimensão de visibilidade: NUNCA altera o status operacional
 * da tarefa. Sempre manual e auditado via RPC `task_archive`.
 */
import { useState } from "react";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { STATUS_LABELS, archiveTask, isOpenPunchError, type TaskRow } from "@/lib/tasks";

export function ArchiveTaskDialog({
  task,
  archive = true,
  open,
  onOpenChange,
  onDone,
  onOpenPunch,
}: {
  task: TaskRow | null;
  archive?: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  onOpenPunch?: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await archiveTask(task.id, archive);
      toast.success(archive ? "Tarefa arquivada." : "Tarefa desarquivada.");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <ModalHeader
          icon={archive ? Archive : ArchiveRestore}
          title={archive ? "Arquivar esta tarefa?" : "Desarquivar esta tarefa?"}
          description={
            archive
              ? "Ela será removida das telas operacionais, mas permanecerá disponível no histórico para a Gestão."
              : "A tarefa volta às listagens ativas mantendo o status original."
          }
        />
        <ModalBody>
          <div className="rounded-xl border border-border bg-card/60 p-3.5 text-sm">
            <div className="font-medium">{task?.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Status atual: {task ? STATUS_LABELS[task.status] : "-"} — o arquivamento não altera este status.
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={submit}>
            {saving ? "Aguarde..." : archive ? "Arquivar" : "Desarquivar"}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
