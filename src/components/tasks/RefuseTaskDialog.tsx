/**
 * OmniBiz — Recusa de tarefa pelo responsável (ADR-062).
 *
 * O funcionário NUNCA cancela uma tarefa: recusa com motivo canónico.
 * "Alterar data / hora" é apenas uma SOLICITAÇÃO — não move a ocorrência nem
 * altera a série. "Necessita reatribuição" é informativo e pode indicar um
 * colega sugerido; a reatribuição continua sendo uma decisão do gestor.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XCircle } from "lucide-react";
import { toast } from "sonner";
import { REFUSAL_REASONS, SCHEDULE_CHANGE_REASON, type TaskRow } from "@/lib/tasks";

export type RefusalSubmitPayload = {
  reason: string;
  requestedDate?: string;
  requestedTime?: string | null;
  needsReassignment?: boolean;
  suggestedEmployeeId?: string | null;
};

export type RefusalMemberOption = { id: string; full_name: string | null };

export function RefuseTaskDialog({
  task,
  clientName,
  members,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  task: TaskRow | null;
  clientName?: string;
  /** Colegas da mesma empresa (RLS/RBAC já aplicados na consulta de origem). */
  members: RefusalMemberOption[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending?: boolean;
  onConfirm: (payload: RefusalSubmitPayload) => void;
}) {
  const [reasonType, setReasonType] = useState<string>(SCHEDULE_CHANGE_REASON);
  const [freeText, setFreeText] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [needsReassignment, setNeedsReassignment] = useState(false);
  const [suggested, setSuggested] = useState("none");

  useEffect(() => {
    if (!open) return;
    setReasonType(SCHEDULE_CHANGE_REASON);
    setFreeText("");
    setRequestedDate("");
    setRequestedTime("");
    setNeedsReassignment(false);
    setSuggested("none");
  }, [open, task?.id]);

  const isScheduleChange = reasonType === SCHEDULE_CHANGE_REASON;
  const isOther = reasonType === "Outro";
  const reason = isOther ? freeText.trim() : reasonType;

  const submit = () => {
    if (!task) return;
    if (isOther && reason.length < 3) {
      toast.error("Descreva o motivo da recusa.");
      return;
    }
    if (isScheduleChange && !requestedDate) {
      toast.error("Informe a nova data desejada.");
      return;
    }
    onConfirm({
      reason,
      requestedDate: isScheduleChange ? requestedDate : undefined,
      requestedTime: isScheduleChange ? requestedTime || null : null,
      needsReassignment: isScheduleChange ? needsReassignment : undefined,
      suggestedEmployeeId: isScheduleChange && needsReassignment && suggested !== "none" ? suggested : null,
    });
  };

  const others = members.filter((m) => m.id !== task?.assigned_to);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !pending && onOpenChange(false)}>
      <DialogContent size="sm">
        <ModalHeader
          icon={XCircle}
          title="Recusar tarefa"
          description="A recusa exige motivo e fica registada no histórico. O gestor decide os próximos passos."
        />
        <ModalBody className="space-y-4">
          <ModalSection title={task?.title ?? "Tarefa"} description={clientName} />

          <div className="space-y-1.5">
            <Label htmlFor="task-refusal-type">Motivo da recusa *</Label>
            <Select value={reasonType} onValueChange={setReasonType}>
              <SelectTrigger id="task-refusal-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFUSAL_REASONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isOther && (
            <div className="space-y-1.5">
              <Label htmlFor="task-refusal-reason">Descreva o motivo *</Label>
              <Textarea
                id="task-refusal-reason"
                value={freeText}
                onChange={(event) => setFreeText(event.target.value)}
                rows={3}
                placeholder="Explique o motivo da recusa"
              />
            </div>
          )}

          {isScheduleChange && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                Isto é apenas um pedido: a tarefa não é movida nem reagendada automaticamente.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="task-refusal-date">Nova data desejada *</Label>
                  <Input
                    id="task-refusal-date"
                    type="date"
                    value={requestedDate}
                    onChange={(event) => setRequestedDate(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-refusal-time">Nova hora desejada</Label>
                  <Input
                    id="task-refusal-time"
                    type="time"
                    value={requestedTime}
                    onChange={(event) => setRequestedTime(event.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={needsReassignment}
                  onChange={(event) => setNeedsReassignment(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Necessita reatribuição para outro funcionário
              </label>
              {needsReassignment && (
                <div className="space-y-1.5">
                  <Label htmlFor="task-refusal-suggested">Funcionário sugerido (opcional)</Label>
                  <Select value={suggested} onValueChange={setSuggested}>
                    <SelectTrigger id="task-refusal-suggested">
                      <SelectValue placeholder="Sem sugestão" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem sugestão</SelectItem>
                      {others.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.full_name?.trim() || "Sem responsável"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A sugestão é informativa. Só o gestor pode reatribuir a tarefa.
                  </p>
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={submit}>
            {pending ? "Recusando..." : "Confirmar recusa"}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
