import { useState } from "react";
import { Dialog, DialogContent, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeePicker, type EmployeeOption } from "@/components/common/EmployeePicker";
import { recurrenceReassign, reassignFromRefusal, isRefused, type ReassignScope, type TaskRow } from "@/lib/tasks";
import { toast } from "sonner";
import { UserCog } from "lucide-react";

export function ReassignDialog({
  task,
  members,
  open,
  onOpenChange,
  onDone,
}: {
  task: TaskRow | null;
  members: EmployeeOption[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [user, setUser] = useState<string>("");
  const [scope, setScope] = useState<ReassignScope>("this");
  const [saving, setSaving] = useState(false);
  const isRecurring = !!task?.recurrence_id;
  const refused = !!task && isRefused(task);

  const submit = async () => {
    if (!task || !user) return;
    setSaving(true);
    try {
      if (refused) {
        await reassignFromRefusal(task.id, user);
        toast.success("Tarefa reatribuída — o histórico da recusa foi preservado.");
      } else {
        const n = await recurrenceReassign(task.id, user, isRecurring ? scope : "this");
        toast.success(`${n} ocorrência(s) atualizada(s)`);
      }
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <ModalHeader
          icon={UserCog}
          title={refused ? "Reatribuir tarefa recusada" : "Reatribuir tarefa"}
          description={
            refused
              ? "A tarefa volta a pendente para o novo responsável. A recusa fica registada no histórico."
              : "Escolha o novo responsável pela tarefa."
          }
        />

        <ModalBody className="space-y-4">
          {refused && (
            <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
              <div className="font-semibold uppercase tracking-wide text-destructive">Recusada</div>
              <div>Motivo: {task?.refusal_reason || "-"}</div>
              {task?.refused_at && (
                <div className="text-muted-foreground">
                  Recusada em: {new Date(task.refused_at).toLocaleString("pt-PT")}
                </div>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Novo responsável</Label>
            <EmployeePicker
              employees={members}
              value={user || null}
              onChange={setUser}
              placeholder="Selecione o funcionário"
              ariaLabel="Selecionar novo responsável pela tarefa"
            />
          </div>
          {isRecurring && !refused && (

            <div className="space-y-1.5">
              <Label>Aplicar em</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as ReassignScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="this">Somente esta ocorrência</SelectItem>
                  <SelectItem value="future">A partir desta (futuras)</SelectItem>
                  <SelectItem value="all">Recorrência completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!user || saving} onClick={submit}>
            {saving ? "Aplicando..." : "Reatribuir"}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}