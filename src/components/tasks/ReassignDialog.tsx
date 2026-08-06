import { useState } from "react";
import { Dialog, DialogContent, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeePicker, type EmployeeOption } from "@/components/common/EmployeePicker";
import { recurrenceReassign, type ReassignScope, type TaskRow } from "@/lib/tasks";
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

  const submit = async () => {
    if (!task || !user) return;
    setSaving(true);
    try {
      const n = await recurrenceReassign(task.id, user, isRecurring ? scope : "this");
      toast.success(`${n} ocorrência(s) atualizada(s)`);
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
        <ModalHeader icon={UserCog} title="Reatribuir tarefa" description="Escolha o novo responsável pela tarefa." />
        <ModalBody className="space-y-4">
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
          {isRecurring && (
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