import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  recurrenceUpdate,
  recurrenceUpdateOccurrence,
  type RecurrenceRow,
  type TaskRow,
  type ReassignScope,
} from "@/lib/tasks";
import { toast } from "sonner";

type Priority = "baixa" | "media" | "alta" | "urgente";

export function EditRecurrenceDialog({
  recurrence,
  task,
  members,
  open,
  onOpenChange,
  onDone,
}: {
  recurrence: RecurrenceRow | null;
  /** When set, scope selector includes "this" (single occurrence). */
  task?: TaskRow | null;
  members: { id: string; full_name: string | null }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const fromTask = task ?? null;
  const allowThis = !!fromTask;
  const [scope, setScope] = useState<ReassignScope>(allowThis ? "this" : "future");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState(""); // HH:MM (series)
  const [scheduledFor, setScheduledFor] = useState(""); // datetime-local (occurrence)
  const [duration, setDuration] = useState<number>(60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope(allowThis ? "this" : "future");
    if (fromTask) {
      setTitle(fromTask.title);
      setPriority(fromTask.priority);
      setAssignedTo(fromTask.assigned_to ?? "");
      const sf = fromTask.scheduled_for;
      if (sf) {
        const d = new Date(sf);
        const pad = (n: number) => String(n).padStart(2, "0");
        setScheduledFor(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
        );
        setScheduledTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      } else if (recurrence) {
        setScheduledTime(recurrence.scheduled_time.slice(0, 5));
      }
      setDuration(recurrence?.duration_minutes ?? 60);
    } else if (recurrence) {
      setTitle(recurrence.title);
      setPriority(recurrence.priority);
      setAssignedTo(recurrence.assigned_to ?? "");
      setScheduledTime(recurrence.scheduled_time.slice(0, 5));
      setDuration(recurrence.duration_minutes);
    }
  }, [open, recurrence, fromTask, allowThis]);

  const submit = async () => {
    if (!recurrence) return;
    setSaving(true);
    try {
      if (scope === "this") {
        if (!fromTask) throw new Error("Tarefa não informada para escopo 'esta'");
        const sfIso = scheduledFor ? new Date(scheduledFor).toISOString() : undefined;
        const sfStart = scheduledFor ? new Date(scheduledFor) : null;
        const seIso = sfStart ? new Date(sfStart.getTime() + duration * 60_000).toISOString() : undefined;
        await recurrenceUpdateOccurrence(fromTask.id, {
          title: title.trim(),
          priority,
          assigned_to: assignedTo || null,
          ...(sfIso ? { scheduled_for: sfIso } : {}),
          ...(seIso ? { scheduled_end: seIso } : {}),
        });
        toast.success("Ocorrência atualizada");
      } else {
        const n = await recurrenceUpdate(
          recurrence.id,
          {
            title: title.trim(),
            priority,
            assigned_to: assignedTo || null,
            scheduled_time: scheduledTime ? `${scheduledTime}:00` : undefined,
            duration_minutes: duration,
          },
          scope === "future" ? "future" : "all",
          scope === "future" ? fromTask?.id ?? null : null,
        );
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar recorrência</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Aplicar em</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ReassignScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowThis && <SelectItem value="this">Apenas esta ocorrência</SelectItem>}
                <SelectItem value="future">Esta e todas as futuras</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {scope === "this" ? (
              <div className="space-y-1.5 col-span-2">
                <Label>Data/hora</Label>
                <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Horário</Label>
                <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Duração (min)</Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 60)}
              />
            </div>
          </div>

          <Button className="w-full" disabled={saving || !title.trim()} onClick={submit}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}