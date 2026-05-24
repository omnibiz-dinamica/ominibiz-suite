import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recurrenceReassign, type ReassignScope, type TaskRow } from "@/lib/tasks";
import { toast } from "sonner";

export function ReassignDialog({
  task,
  members,
  open,
  onOpenChange,
  onDone,
}: {
  task: TaskRow | null;
  members: { id: string; full_name: string | null }[];
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
      <DialogContent>
        <DialogHeader><DialogTitle>Reatribuir tarefa</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Novo responsável</Label>
            <Select value={user} onValueChange={setUser}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button className="w-full" disabled={!user || saving} onClick={submit}>
            {saving ? "Aplicando..." : "Reatribuir"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}