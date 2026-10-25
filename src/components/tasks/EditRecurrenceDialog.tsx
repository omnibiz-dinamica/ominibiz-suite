import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useFormDraft } from "@/lib/form-draft";
import { DraftNotice } from "@/components/form-draft/DraftNotice";
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
  members: { id: string; full_name: string | null; is_active?: boolean | null }[];
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
  // 11092026-003c — datas da série (date-only, nunca convertidas por Date/UTC).
  const [seriesStart, setSeriesStart] = useState("");
  const [seriesEnd, setSeriesEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [scheduleConflicts, setScheduleConflicts] = useState<TaskScheduleConflict[]>([]);

  interface RecurrenceEditDraft extends Record<string, unknown> {
    scope: ReassignScope;
    title: string;
    priority: Priority;
    assignedTo: string;
    scheduledTime: string;
    scheduledFor: string;
    duration: number;
    seriesStart: string;
    seriesEnd: string;
  }
  const { user } = useAuth();
  const currentValues = (): RecurrenceEditDraft => ({
    scope,
    title,
    priority,
    assignedTo,
    scheduledTime,
    scheduledFor,
    duration,
    seriesStart,
    seriesEnd,
  });
  const appliedDraftRef = useRef(false);
  const restoredDraftRef = useRef<RecurrenceEditDraft | null>(null);
  const initialFingerprintRef = useRef("");
  const draft = useFormDraft<RecurrenceEditDraft>({
    formId: "recurrence-form",
    recordId: recurrence?.id ?? null,
    companyId: recurrence?.company_id ?? null,
    userId: user?.id,
    enabled: open && !!recurrence,
    baseUpdatedAt: recurrence?.updated_at ?? null,
    dirty: open && initialFingerprintRef.current !== "" && JSON.stringify(currentValues()) !== initialFingerprintRef.current,
  });

  const applyDraft = (values: RecurrenceEditDraft) => {
    appliedDraftRef.current = true;
    setScope(values.scope);
    setTitle(values.title);
    setPriority(values.priority);
    setAssignedTo(values.assignedTo);
    setScheduledTime(values.scheduledTime);
    setScheduledFor(values.scheduledFor);
    setDuration(values.duration);
    setSeriesStart(values.seriesStart);
    setSeriesEnd(values.seriesEnd);
    initialFingerprintRef.current = JSON.stringify(values);
  };

  // Restaura o rascunho depois da inicialização normal dos campos.
  useEffect(() => {
    if (!open || !draft.restored || appliedDraftRef.current) return;
    restoredDraftRef.current = draft.restored;
    if (draft.conflict) return;
    applyDraft(draft.restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft.restored, draft.conflict]);

  const isDirtyNow = () =>
    initialFingerprintRef.current !== "" && JSON.stringify(currentValues()) !== initialFingerprintRef.current;

  // Grava o rascunho (debounced no hook) só quando os campos diferem da linha de base.
  useEffect(() => {
    if (!open) return;
    if (draft.restored && !appliedDraftRef.current) return; // rascunho pendente de decisão
    if (!isDirtyNow()) return;
    draft.save(currentValues(), { open: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, title, priority, assignedTo, scheduledTime, scheduledFor, duration, seriesStart, seriesEnd]);

  // Fechar por ESC/clique fora: mantém o rascunho com open:false (só se alterado).
  const handleOpenChange = (v: boolean) => {
    if (!v && isDirtyNow()) draft.save(currentValues(), { open: false });
    onOpenChange(v);
  };

  const clearDraft = () => {
    appliedDraftRef.current = false;
    restoredDraftRef.current = null;
    draft.clear();
  };

  // Valores iniciais derivados do registo (linha de base do rascunho).
  const initialValues = (): RecurrenceEditDraft => {
    const v: RecurrenceEditDraft = {
      scope: allowThis ? "this" : "future",
      title,
      priority,
      assignedTo,
      scheduledTime,
      scheduledFor,
      duration,
      seriesStart: recurrence?.start_date ?? "",
      seriesEnd: recurrence?.end_date ?? "",
    };
    if (fromTask) {
      v.title = fromTask.title;
      v.priority = fromTask.priority;
      v.assignedTo = fromTask.assigned_to ?? "";
      const sf = fromTask.scheduled_for;
      if (sf) {
        v.scheduledFor = wallISOToInput(sf);
        v.scheduledTime = formatWallTime(sf);
      } else if (recurrence) {
        v.scheduledTime = recurrence.scheduled_time?.slice(0, 5) ?? "";
        v.scheduledFor = "";
      }
      v.duration = recurrence?.duration_minutes ?? 0;
    } else if (recurrence) {
      v.title = recurrence.title;
      v.priority = recurrence.priority;
      v.assignedTo = recurrence.assigned_to ?? "";
      v.scheduledTime = recurrence.scheduled_time?.slice(0, 5) ?? "";
      v.duration = recurrence.duration_minutes;
    }
    return v;
  };
  const setFields = (v: RecurrenceEditDraft) => {
    setScope(v.scope);
    setTitle(v.title);
    setPriority(v.priority);
    setAssignedTo(v.assignedTo);
    setScheduledTime(v.scheduledTime);
    setScheduledFor(v.scheduledFor);
    setDuration(v.duration);
    setSeriesStart(v.seriesStart);
    setSeriesEnd(v.seriesEnd);
  };
  // Descartar: limpa o rascunho e repõe os valores do registo.
  const discardDraft = () => {
    const v = initialValues();
    initialFingerprintRef.current = JSON.stringify(v);
    setFields(v);
    clearDraft();
  };

  useEffect(() => {
    if (!open) return;
    const v = initialValues();
    if (!appliedDraftRef.current) {
      setFields(v);
    }
    initialFingerprintRef.current = JSON.stringify(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recurrence, fromTask, allowThis]);

  const submit = async (confirmed = false) => {
    if (!recurrence) return;
    if (saving) return;
    if (!assignedTo) {
      toast.error("Atribua a tarefa a um funcionario antes de salvar.");
      return;
    }
    const editableDates = scope !== "this" && recurrence.frequency !== "custom";
    if (editableDates) {
      if (!seriesStart) {
        toast.error("Informe a data inicial da recorrência.");
        return;
      }
      if (seriesEnd && seriesEnd < seriesStart) {
        toast.error("A data final da recorrência não pode ser anterior à data inicial.");
        return;
      }
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
        const safeDuration = Math.max(0, duration || 0);
        const startDate = scheduledFor.slice(0, 10);
        const startTime = scheduledFor.slice(11, 16);
        const end = sfIso && safeDuration > 0 ? addWallMinutes(startDate, startTime, safeDuration) : null;
        const seIso = end ? wallDateTimeToISO(end.date, end.time) : null;
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
            ...(recurrence.frequency !== "custom"
              ? { start_date: seriesStart, end_date: seriesEnd || null }
              : {}),
          },
          scope === "future" ? "future" : "all",
          scope === "future" ? (fromTask?.id ?? null) : null,
        );
        toast.success(`${n} ocorrência(s) atualizada(s)`);
      }
      clearDraft();
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <ModalHeader icon={Repeat} title="Editar recorrência" description="Atualize os dados desta série de tarefas." />
        <ModalBody className="space-y-4">
          {draft.savedAt !== null && (
            <DraftNotice
              savedAt={draft.savedAt}
              conflict={draft.conflict}
              onUseDraft={() => {
                if (restoredDraftRef.current) applyDraft(restoredDraftRef.current);
              }}
              onDiscard={clearDraft}
            />
          )}
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
                  {members
                    .filter((m) => m.is_active !== false || m.id === assignedTo)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name ?? m.id.slice(0, 8)}
                        {m.is_active === false && " (Inativo)"}
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

            {scope !== "this" && recurrence?.frequency !== "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label>Data inicial da recorrência</Label>
                  <Input type="date" value={seriesStart} onChange={(e) => setSeriesStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Data final (opcional)</Label>
                  <Input type="date" value={seriesEnd} onChange={(e) => setSeriesEnd(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">
                    A data final é inclusiva. Ocorrências futuras ainda pendentes fora do período são removidas.
                  </p>
                </div>
              </>
            )}
          </div>


        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              clearDraft();
              onOpenChange(false);
            }}
          >
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
