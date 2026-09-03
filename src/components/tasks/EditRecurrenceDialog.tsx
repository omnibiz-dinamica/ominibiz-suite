import { useEffect, useState } from "react";
import { Dialog, DialogContent, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  recurrenceUpdate,
  recurrenceUpdateOccurrence,
  checkTaskScheduleConflicts,
  previewRecurrenceDates,
  type TaskScheduleConflict,
  type RecurrenceRow,
  type TaskRow,
  type ReassignScope,
} from "@/lib/tasks";
import { addWallMinutes } from "@/lib/tasks/contracted-hours";
import { localDateToDateKey } from "@/lib/tasks/custom-recurrence";
import { formatWallDate, formatWallTime, wallDateTimeToISO, wallInputToISO, wallISOToInput } from "@/lib/wall-clock";
import { AlertTriangle, Repeat } from "lucide-react";
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
  const [duration, setDuration] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [scheduleConflicts, setScheduleConflicts] = useState<TaskScheduleConflict[]>([]);

  useEffect(() => {
    if (!open) return;
    setScope(allowThis ? "this" : "future");
    if (fromTask) {
      setTitle(fromTask.title);
      setPriority(fromTask.priority);
      setAssignedTo(fromTask.assigned_to ?? "");
      const sf = fromTask.scheduled_for;
      if (sf) {
        setScheduledFor(wallISOToInput(sf));
        setScheduledTime(formatWallTime(sf));
      } else if (recurrence) {
        setScheduledTime(recurrence.scheduled_time?.slice(0, 5) ?? "");
        setScheduledFor("");
      }
      setDuration(recurrence?.duration_minutes ?? 0);
    } else if (recurrence) {
      setTitle(recurrence.title);
      setPriority(recurrence.priority);
      setAssignedTo(recurrence.assigned_to ?? "");
      setScheduledTime(recurrence.scheduled_time?.slice(0, 5) ?? "");
      setDuration(recurrence.duration_minutes);
    }
  }, [open, recurrence, fromTask, allowThis]);

  const submit = async (confirmed = false) => {
    if (!recurrence) return;
    if (saving) return;
    if (!assignedTo) {
      toast.error("Atribua a tarefa a um funcionario antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      if (!confirmed) {
        const recurrenceDates =
          scope === "this"
            ? []
            : recurrence.frequency === "custom"
              ? recurrence.selected_dates.filter((date) =>
                  !fromTask?.recurrence_date || date >= fromTask.recurrence_date,
                )
              : previewRecurrenceDates(
                  {
                    frequency: recurrence.frequency,
                    intervalWeeks: recurrence.interval_weeks,
                    weekdays: recurrence.weekdays,
                    monthlyRule: recurrence.monthly_rule,
                    startDate: recurrence.start_date,
                    endDate: recurrence.end_date,
                  },
                  400,
                )
                  .map(localDateToDateKey)
                  .filter((date) => !fromTask?.recurrence_date || date >= fromTask.recurrence_date);
        const proposals =
          scope === "this"
            ? (() => {
                const start = wallInputToISO(scheduledFor);
                const end =
                  start && duration > 0
                    ? addWallMinutes(
                        scheduledFor.slice(0, 10),
                        scheduledFor.slice(11, 16),
                        Math.max(0, duration),
                      )
                    : null;
                const endISO = end ? wallDateTimeToISO(end.date, end.time) : null;
                return start && endISO ? [{ assignee_id: assignedTo, start_at: start, end_at: endISO }] : [];
              })()
            : recurrenceDates.flatMap((date) => {
                if (!scheduledTime || duration <= 0) return [];
                const end = addWallMinutes(date, scheduledTime, duration);
                const start = wallDateTimeToISO(date, scheduledTime);
                const endISO = end ? wallDateTimeToISO(end.date, end.time) : null;
                return start && endISO ? [{ assignee_id: assignedTo, start_at: start, end_at: endISO }] : [];
              });
        const conflicts = await checkTaskScheduleConflicts(
          recurrence.company_id,
          proposals,
          scope === "this" ? fromTask?.id : null,
        );
        if (conflicts.length > 0) {
          setScheduleConflicts(conflicts);
          setSaving(false);
          return;
        }
      }
      if (scope === "this") {
        if (!fromTask) throw new Error("Tarefa não informada para escopo 'esta'");
        const sfIso = wallInputToISO(scheduledFor);
        const sfStart = sfIso ? new Date(sfIso) : null;
        const safeDuration = Math.max(0, duration || 0);
        const seIso =
          sfStart && safeDuration > 0 ? new Date(sfStart.getTime() + safeDuration * 60_000).toISOString() : null;
        await recurrenceUpdateOccurrence(fromTask.id, {
          title: title.trim(),
          priority,
          assigned_to: assignedTo,
          scheduled_for: sfIso,
          scheduled_end: seIso,
        });
        toast.success("Ocorrência atualizada");
      } else {
        const n = await recurrenceUpdate(
          recurrence.id,
          {
            title: title.trim(),
            priority,
            assigned_to: assignedTo,
            scheduled_time: scheduledTime ? `${scheduledTime}:00` : null,
            duration_minutes: Math.max(0, duration || 0),
          },
          scope === "future" ? "future" : "all",
          scope === "future" ? (fromTask?.id ?? null) : null,
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
      <DialogContent size="md">
        <ModalHeader icon={Repeat} title="Editar recorrência" description="Atualize os dados desta série de tarefas." />
        <ModalBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Aplicar em</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ReassignScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name ?? m.id.slice(0, 8)}
                    </SelectItem>
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
                min={0}
                max={1440}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 0)}
              />
            </div>
          </div>

        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={saving || !title.trim() || !assignedTo} onClick={() => void submit()}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </ModalFooter>
        <AlertDialog
          open={scheduleConflicts.length > 0}
          onOpenChange={(value) => {
            if (!value) setScheduleConflicts([]);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-warning-foreground">
                <AlertTriangle className="h-5 w-5" /> Atenção: sobreposição de tarefas
              </AlertDialogTitle>
              <AlertDialogDescription>
                A alteração é permitida, mas existe conflito de horário para o responsável selecionado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              {scheduleConflicts.map((conflict, index) => (
                <div key={`${conflict.conflicting_task_id}-${conflict.proposed_start}-${index}`} className="space-y-1">
                  <p className="font-semibold text-foreground">
                    {conflict.assignee_name?.trim() || members.find((m) => m.id === conflict.assignee_id)?.full_name || "Funcionário"}
                  </p>
                  <p className="text-muted-foreground">
                    Tarefa existente: <span className="font-medium text-foreground">{conflict.conflicting_client_name || conflict.conflicting_title}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {formatWallDate(conflict.conflicting_start)} · {formatWallTime(conflict.conflicting_start)} → {formatWallTime(conflict.conflicting_end)}
                  </p>
                  <p className="text-warning-foreground">
                    Conflito: {formatWallTime(conflict.overlap_start)} → {formatWallTime(conflict.overlap_end)}
                  </p>
                </div>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setScheduleConflicts([])}>Voltar e ajustar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  setScheduleConflicts([]);
                  void submit(true);
                }}
              >
                Salvar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
