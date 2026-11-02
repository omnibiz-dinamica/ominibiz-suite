// Tarefas · calendário (dia/semana/mês) e cartões de tarefa/férias (extraído de app.tarefas.tsx).

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RecordHistoryMenu } from "@/components/history/RecordHistoryMenu";
import { Clock, Pencil, Repeat, UserCog, Users, Trash2, CalendarDays, Building2, ChevronLeft, ChevronRight, FileText, Info as InfoIcon, MapPin as MapPinIcon, ChevronDown as ChevronDownIcon } from "lucide-react";
import { STATUS_LABELS, STATUS_TONE, type TaskRow, availableActions, formatStartedLateMinutes, isVisuallyLate, resolveOperationalStatus, startedLateMinutes, AUTO_RECURRENCE_BADGE_LABEL, AUTO_RECURRENCE_BADGE_TITLE } from "@/lib/tasks";

import { currentTaskCancellation, currentTaskRefusal } from "@/lib/task-refusal-view";

import { taskCalendarDateKey, tasksForCalendarDay } from "@/lib/tasks/calendar-filter";
import { sortTasksForList } from "@/lib/tasks/list-order";
import { taskOperationalDay } from "@/lib/tasks/dashboard-counters";
import { wallISOToDateInput, formatWallDate, formatWallTime, formatLocalTime } from "@/lib/wall-clock";
import { ClientOption, clientAddressCache, taskClientInstructions, taskHeading, ApprovedVacation, CalendarMode, taskMemberName, RowHandlers, tasksRouteApi } from "./shared";
import { FilterChip, TaskRefusalHistory, PauseSummary, ActionButton, CompletionNoteBlock, ClientFilterEmptyState } from "./list";

export function TaskPlanningCalendar({
  tasks,
  vacations,
  members,
  clients,
  groupBy,
  seedAssigneeIds,
  clientFilterActive = false,
  otherFiltersActive = false,
  onClearClientFilter,
  ...handlers
}: RowHandlers & {
  tasks: TaskRow[];
  vacations: ApprovedVacation[];
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client" | "all";
  /** Colaboradores que devem aparecer mesmo sem tarefas no período. */
  seedAssigneeIds?: string[];
  /** Com filtro de cliente: só aparecem grupos com tarefas no período exibido. */
  clientFilterActive?: boolean;
  otherFiltersActive?: boolean;
  onClearClientFilter?: () => void;
}) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [cursor, setCursor] = useState(() => new Date());
  // Notificação: posiciona o calendário na data da tarefa aberta.
  const calendarFocusTaskId = tasksRouteApi.useSearch().task;
  const calendarFocusDay = useMemo(() => {
    const focused = calendarFocusTaskId ? tasks.find((t) => t.id === calendarFocusTaskId) : undefined;
    return focused ? taskOperationalDay(focused) : null;
  }, [calendarFocusTaskId, tasks]);
  useEffect(() => {
    if (calendarFocusDay && /^\d{4}-\d{2}-\d{2}$/.test(calendarFocusDay)) {
      setCursor(new Date(`${calendarFocusDay}T12:00:00`));
    }
  }, [calendarFocusDay]);
  const memberName = (id: string | null) => taskMemberName(members, id, "Sem responsável");
  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? (id ? id.slice(0, 8) : "Sem cliente");
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const startOfWeek = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  };
  const addDays = (date: Date, days: number) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  };
  const tasksForKey = (list: TaskRow[], key: string) => tasksForCalendarDay(list, key);
  const vacationsForKey = (list: ApprovedVacation[], key: string) =>
    list.filter((vacation) => vacation.start_date <= key && vacation.end_date >= key);
  const addPeriod = (direction: -1 | 1) => {
    setCursor((current) => {
      const next = new Date(current);
      if (mode === "day") next.setDate(next.getDate() + direction);
      if (mode === "week") next.setDate(next.getDate() + direction * 7);
      if (mode === "month") next.setMonth(next.getMonth() + direction);
      if (mode === "year") next.setFullYear(next.getFullYear() + direction);
      return next;
    });
  };
  const periodLabel = useMemo(() => {
    if (mode === "day") {
      return cursor.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    }
    if (mode === "week") {
      const start = startOfWeek(cursor);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })} - ${end.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}`;
    }
    if (mode === "month") {
      return cursor.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
    }
    return cursor.toLocaleDateString("pt-PT", { year: "numeric" });
  }, [cursor, mode]);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index));
  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [cursor]);
  const yearMonths = useMemo(
    () => Array.from({ length: 12 }, (_, month) => new Date(cursor.getFullYear(), month, 1)),
    [cursor],
  );

  // Intervalo visível do período (dia, semana, grelha do mês ou ano).
  const [rangeStart, rangeEnd] = (() => {
    if (mode === "day") return [dateKey(cursor), dateKey(cursor)];
    if (mode === "week") return [dateKey(weekDays[0]), dateKey(weekDays[6])];
    if (mode === "month") return [dateKey(monthDays[0]), dateKey(monthDays[41])];
    return [`${cursor.getFullYear()}-01-01`, `${cursor.getFullYear()}-12-31`];
  })();
  const inRange = (task: TaskRow) => {
    const k = taskCalendarDateKey(task);
    return !!k && k >= rangeStart && k <= rangeEnd;
  };

  const groups = new Map<string, TaskRow[]>();
  // Na vista por colaborador, toda a equipa aparece — quem não tem tarefas no
  // período fica com o bloco vazio, sem desaparecer da lista.
  if (groupBy === "assignee" && !clientFilterActive) {
    for (const id of seedAssigneeIds ?? []) if (!groups.has(id)) groups.set(id, []);
  }

  for (const task of tasks) {
    const key =
      groupBy === "all"
        ? "__all__"
        : groupBy === "assignee"
          ? (task.assigned_to ?? "__unassigned__")
          : (task.client_id ?? "__no_client__");
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }
  for (const vacation of clientFilterActive ? [] : vacations) {
    const key = groupBy === "all" ? "__all__" : groupBy === "assignee" ? vacation.user_id : "__no_client__";
    if (!groups.has(key)) groups.set(key, []);
  }
  // Filtro de cliente: esconder grupos sem tarefas no período exibido.
  if (clientFilterActive) {
    for (const [key, list] of groups) if (!list.some(inRange)) groups.delete(key);
  }
  const groupEntries = Array.from(groups.entries()).sort(([a], [b]) => {
    const labelA =
      groupBy === "all"
        ? "Meu calendário"
        : groupBy === "assignee"
          ? memberName(a === "__unassigned__" ? null : a)
          : clientName(a === "__no_client__" ? null : a);
    const labelB =
      groupBy === "all"
        ? "Meu calendário"
        : groupBy === "assignee"
          ? memberName(b === "__unassigned__" ? null : b)
          : clientName(b === "__no_client__" ? null : b);
    return labelA.localeCompare(labelB);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <Button type="button" variant="ghost" size="sm" title="Periodo anterior" onClick={() => addPeriod(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button type="button" variant="ghost" size="sm" title="Proximo periodo" onClick={() => addPeriod(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-w-48 flex-1 text-sm font-semibold capitalize">{periodLabel}</div>
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["day", "Dia"],
              ["week", "Semana"],
              ["month", "Mes"],
              ["year", "Ano"],
            ] as const
          ).map(([key, label]) => (
            <FilterChip key={key} label={label} active={mode === key} onClick={() => setMode(key)} />
          ))}
        </div>
      </div>

      {clientFilterActive && groupEntries.length === 0 && (
        <ClientFilterEmptyState withOtherFilters={otherFiltersActive} onClear={onClearClientFilter} />
      )}
      {groupEntries.map(([key, groupTasks]) => {
        const groupVacations =
          groupBy === "all"
            ? vacations
            : groupBy === "assignee"
              ? vacations.filter((vacation) => vacation.user_id === key)
              : key === "__no_client__"
                ? vacations
                : [];
        const title =
          groupBy === "all"
            ? "Meu calendário"
            : groupBy === "assignee"
              ? memberName(key === "__unassigned__" ? null : key)
              : clientName(key === "__no_client__" ? null : key);

        return (
          <section key={key} className="rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                {groupBy === "all" ? (
                  <CalendarDays className="h-4 w-4" />
                ) : groupBy === "assignee" ? (
                  <Users className="h-4 w-4" />
                ) : (
                  <Building2 className="h-4 w-4" />
                )}
              </span>
              <div>
                <h2 className="font-display text-base font-semibold">{title}</h2>
                <p className="text-xs text-muted-foreground">
                  {groupTasks.length} {groupTasks.length === 1 ? "tarefa" : "tarefas"}
                  {groupVacations.length > 0 && ` · ${groupVacations.length} período(s) de férias`}
                </p>
              </div>
            </div>

            {mode === "day" && (
              <div className="p-4">
                <CalendarDayColumn
                  label={cursor.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "2-digit" })}
                  dateKeyValue={dateKey(cursor)}
                  tasks={tasksForKey(groupTasks, dateKey(cursor))}
                  vacations={vacationsForKey(groupVacations, dateKey(cursor))}
                  members={members}
                  clients={clients}
                  groupBy={groupBy}
                  handlers={handlers}
                />
              </div>
            )}

            {mode === "week" && (
              <div className="grid gap-3 p-4 lg:grid-cols-7">
                {weekDays.map((day) => (
                  <CalendarDayColumn
                    key={dateKey(day)}
                    label={day.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    dateKeyValue={dateKey(day)}
                    tasks={tasksForKey(groupTasks, dateKey(day))}
                    vacations={vacationsForKey(groupVacations, dateKey(day))}
                    members={members}
                    clients={clients}
                    groupBy={groupBy}
                    handlers={handlers}
                  />
                ))}
              </div>
            )}

            {mode === "month" && (
              <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-7">
                {monthDays.map((day) => {
                  const dayTasks = tasksForKey(groupTasks, dateKey(day));
                  const dayVacations = vacationsForKey(groupVacations, dateKey(day));
                  const muted = day.getMonth() !== cursor.getMonth();
                  return (
                    <div
                      key={dateKey(day)}
                      className={`min-h-28 rounded-lg border border-border bg-background p-2 transition hover:border-primary/40 ${muted ? "opacity-50" : ""}`}
                      onDragOver={(event) => {
                        if (handlers.isManager) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        if (!handlers.isManager) return;
                        event.preventDefault();
                        const taskId = event.dataTransfer.getData("text/task-id");
                        if (taskId) handlers.onMoveDate(taskId, dateKey(day));
                      }}
                    >
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {day.toLocaleDateString("pt-PT", { day: "2-digit", weekday: "short" })}
                        </span>
                        {dayTasks.length + dayVacations.length > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                            {dayTasks.length + dayVacations.length}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {dayTasks.slice(0, 4).map((task) => (
                          <MiniTaskChip
                            key={task.id}
                            task={task}
                            startedAt={handlers.taskPunches.get(task.id)?.started_at}
                            onClick={() => handlers.onEdit(task)}
                          />
                        ))}
                        {dayVacations.map((vacation) => (
                          <MiniVacationChip key={vacation.id} vacation={vacation} />
                        ))}
                      </ul>
                      {dayTasks.length > 4 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">+{dayTasks.length - 4} tarefas</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {mode === "year" && (
              <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
                {yearMonths.map((month) => {
                  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
                  const monthTasks = sortTasksForList(groupTasks).filter((task) => {
                    const source = task.scheduled_for ?? task.recurrence_date ?? task.due_at;
                    return wallISOToDateInput(source).slice(0, 7) === monthKey;
                  });
                  const monthVacations = groupVacations.filter(
                    (vacation) =>
                      vacation.start_date.slice(0, 7) <= monthKey && vacation.end_date.slice(0, 7) >= monthKey,
                  );
                  return (
                    <div key={month.getMonth()} className="min-h-36 rounded-lg border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold capitalize">
                          {month.toLocaleDateString("pt-PT", { month: "long" })}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          {monthTasks.length + monthVacations.length}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {monthTasks.slice(0, 5).map((task) => (
                          <MiniTaskChip
                            key={task.id}
                            task={task}
                            startedAt={handlers.taskPunches.get(task.id)?.started_at}
                            onClick={() => handlers.onEdit(task)}
                          />
                        ))}
                        {monthVacations.slice(0, 5).map((vacation) => (
                          <MiniVacationChip key={vacation.id} vacation={vacation} />
                        ))}
                      </ul>
                      {monthTasks.length === 0 && monthVacations.length === 0 && (
                        <p className="text-xs text-muted-foreground">Sem tarefas ou férias</p>
                      )}
                      {monthTasks.length > 5 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">+{monthTasks.length - 5} tarefas</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function CalendarDayColumn({
  label,
  dateKeyValue,
  tasks,
  vacations,
  members,
  clients,
  groupBy,
  handlers,
}: {
  label: string;
  dateKeyValue: string;
  tasks: TaskRow[];
  vacations: ApprovedVacation[];
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client" | "all";
  handlers: RowHandlers;
}) {
  return (
    <div
      className="min-h-40 rounded-lg border border-border bg-background transition hover:border-primary/40"
      onDragOver={(event) => {
        if (handlers.isManager) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!handlers.isManager) return;
        event.preventDefault();
        const taskId = event.dataTransfer.getData("text/task-id");
        if (taskId) handlers.onMoveDate(taskId, dateKeyValue);
      }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium capitalize">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className="text-xs text-muted-foreground">{tasks.length + vacations.length}</span>
      </div>
      {tasks.length === 0 && vacations.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Sem tarefas ou férias</p>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((task) => (
            <CalendarTaskCard
              key={task.id}
              task={task}
              members={members}
              clients={clients}
              groupBy={groupBy}
              {...handlers}
            />
          ))}
          {vacations.map((vacation) => (
            <CalendarVacationCard key={vacation.id} vacation={vacation} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Etiqueta da programação do cliente (ex.: Klein / Grote). */
export function ScheduleNameBadge({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <span
      className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
      title={`Programação do cliente: ${name}`}
    >
      {name}
    </span>
  );
}

/** Botão "Ver instruções do cliente" no cartão do calendário: só aparece com texto; começa fechado. */
export function CalendarClientInstructions({ text }: { text?: string | null }) {
  const [open, setOpen] = useState(false);
  const value = (text ?? "").trim();
  if (!value) return null;
  return (
    <div className="mt-1 min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <InfoIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{open ? "Ocultar instruções do cliente" : "Ver instruções do cliente"}</span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <p className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-foreground">
          {value}
        </p>
      )}
    </div>
  );
}

/** Endereço do cliente com atalhos de navegação (Google Maps, Waze, Mapas) e Copiar. */
export function TaskClientAddress({ clientId }: { clientId?: string | null }) {
  const info = clientId ? clientAddressCache.get(clientId) : undefined;
  if (!info) return null;
  const hasGeo = info.lat !== null && info.lng !== null;
  const dest = hasGeo ? `${info.lat},${info.lng}` : (info.address ?? "");
  if (!dest) return null;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  const waze = hasGeo
    ? `https://waze.com/ul?ll=${info.lat},${info.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(info.address ?? "")}&navigate=yes`;
  const apple = `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`;
  const copy = () => {
    const text = info.address ?? dest;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast.success("Endereço copiado"),
        () => toast.error("Não foi possível copiar o endereço"),
      );
    } else {
      toast.error("Não foi possível copiar o endereço");
    }
  };
  const linkClass = "font-medium text-primary hover:underline";
  return (
    <div className="mt-1 min-w-0 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
      {info.address && (
        <div className="flex items-start gap-1">
          <MapPinIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className="break-words">{info.address}</span>
        </div>
      )}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Ir com:</span>
        <a href={google} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Google Maps
        </a>
        <a href={waze} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Waze
        </a>
        <a href={apple} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Mapas
        </a>
        <button type="button" onClick={copy} className={linkClass}>
          Copiar
        </button>
      </div>
    </div>
  );
}

/** Endereço + instruções adicionais do cliente (lista e calendário, PC e celular). */
export function TaskClientDetails({ task }: { task: { client_id?: string | null } }) {
  return (
    <>
      <TaskClientAddress clientId={task.client_id} />
      <CalendarClientInstructions text={taskClientInstructions(task)} />
    </>
  );
}

export function MiniTaskChip({ task, startedAt, onClick }: { task: TaskRow; startedAt?: string; onClick: () => void }) {
  const start = formatWallTime(task.scheduled_for);
  const lateMinutes = startedLateMinutes(task, startedAt);
  return (
    <RecordHistoryMenu entityType="task" entityId={task.id} related={[{ type: "recurrence", id: task.recurrence_id }]} title={task.title}>
    <button
      data-task-id={task.id}
      type="button"
      draggable={false}
      onClick={onClick}
      className="block w-full truncate rounded-md bg-primary/10 px-2 py-1 text-left text-[11px] font-medium text-primary hover:bg-primary/15"
      title={
        lateMinutes != null
          ? `${taskHeading(task)} · Início com atraso · ${formatStartedLateMinutes(lateMinutes)}${taskClientInstructions(task) ? `\nInstruções: ${taskClientInstructions(task)}` : ""}`
          : `${taskHeading(task)}${taskClientInstructions(task) ? `\nInstruções: ${taskClientInstructions(task)}` : ""}`
      }
    >
      {start ? `${start} ` : ""}
      {task.schedule_name ? `[${task.schedule_name}] ` : ""}
      {taskClientInstructions(task) ? (
        <InfoIcon className="mr-0.5 inline h-3 w-3 align-[-2px]" aria-label="Tem instruções do cliente" />
      ) : null}
      {taskHeading(task)}
    </button>
    </RecordHistoryMenu>
  );
}

export function MiniVacationChip({ vacation }: { vacation: ApprovedVacation }) {
  return (
    <li
      className="truncate rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-left text-[11px] font-medium text-emerald-700"
      title={`Férias aprovadas · ${vacation.start_date} → ${vacation.end_date}`}
    >
      Férias · Aprovadas
    </li>
  );
}

export function CalendarVacationCard({ vacation }: { vacation: ApprovedVacation }) {
  const start = formatWallDate(vacation.start_date) || vacation.start_date;
  const end = formatWallDate(vacation.end_date) || vacation.end_date;
  return (
    <li className="space-y-1 border-l-2 border-emerald-500 bg-emerald-50/70 px-3 py-3 text-emerald-800">
      <div className="text-sm font-semibold">Férias</div>
      <div className="text-xs">
        {start} → {end}
      </div>
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
        Aprovadas
      </span>
    </li>
  );
}

export function TaskCalendar({
  tasks,
  members,
  clients,
  groupBy,
  ...handlers
}: RowHandlers & {
  tasks: TaskRow[];
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client";
}) {
  const memberName = (id: string | null) => taskMemberName(members, id);
  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? (id ? id.slice(0, 8) : "Sem cliente");

  const groups = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const key = groupBy === "assignee" ? (task.assigned_to ?? "__unassigned__") : (task.client_id ?? "__no_client__");
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }

  const groupEntries = Array.from(groups.entries()).sort(([a], [b]) => {
    const labelA =
      groupBy === "assignee"
        ? memberName(a === "__unassigned__" ? null : a)
        : clientName(a === "__no_client__" ? null : a);
    const labelB =
      groupBy === "assignee"
        ? memberName(b === "__unassigned__" ? null : b)
        : clientName(b === "__no_client__" ? null : b);
    return labelA.localeCompare(labelB);
  });

  const dayKey = (task: TaskRow) => {
    const daySource = task.scheduled_for ?? task.recurrence_date ?? task.due_at;
    return wallISOToDateInput(daySource) || "__unscheduled__";
  };
  const dayLabel = (key: string) => {
    if (key === "__unscheduled__") return "Sem data";
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("pt-PT", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      {groupEntries.map(([key, groupTasks]) => {
        const title =
          groupBy === "assignee"
            ? memberName(key === "__unassigned__" ? null : key)
            : clientName(key === "__no_client__" ? null : key);
        const byDay = new Map<string, TaskRow[]>();
        for (const task of groupTasks) {
          const keyForDay = dayKey(task);
          const list = byDay.get(keyForDay) ?? [];
          list.push(task);
          byDay.set(keyForDay, list);
        }
        const dayEntries = Array.from(byDay.entries()).sort(([a], [b]) => {
          if (a === "__unscheduled__") return 1;
          if (b === "__unscheduled__") return -1;
          return a.localeCompare(b);
        });

        return (
          <section key={key} className="rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                {groupBy === "assignee" ? <Users className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              </span>
              <div>
                <h2 className="font-display text-base font-semibold">{title}</h2>
                <p className="text-xs text-muted-foreground">
                  {groupTasks.length} {groupTasks.length === 1 ? "tarefa" : "tarefas"}
                </p>
              </div>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {dayEntries.map(([day, dayTasks]) => (
                <div key={day} className="min-h-32 rounded-lg border border-border bg-background">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {dayLabel(day)}
                    </div>
                    <span className="text-xs text-muted-foreground">{dayTasks.length}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {dayTasks
                      .slice()
                      .sort((a, b) =>
                        (a.scheduled_for ?? a.recurrence_date ?? a.due_at ?? "").localeCompare(
                          b.scheduled_for ?? b.recurrence_date ?? b.due_at ?? "",
                        ),
                      )
                      .map((task) => (
                        <CalendarTaskCard
                          key={task.id}
                          task={task}
                          members={members}
                          clients={clients}
                          groupBy={groupBy}
                          {...handlers}
                        />
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CalendarTaskCard({
  task,
  members,
  clients,
  groupBy,
  userId,
  isManager,
  onEdit,
  onEditSeries,
  onReassign,
  onDelete,
  onTransition,
  transitionPending,
  refusalsByTask,
  memberNames,
  groupMemberNames,
  selectedTaskIds,
  onToggleTaskSelection,
  onNoStartReason,
  taskPunches,
  completionNotes,
}: RowHandlers & {
  task: TaskRow;
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client" | "all";
}) {
  const late = isVisuallyLate(task);
  const operationalStatus = resolveOperationalStatus(task);
  const actions = availableActions(task, { userId, isManager });
  const start = formatWallTime(task.scheduled_for);
  const end = formatWallTime(task.scheduled_end);
  const dateOnly =
    !task.scheduled_for && (task.recurrence_date || task.due_at)
      ? formatWallDate(task.recurrence_date ?? task.due_at)
      : "";
  const memberName = taskMemberName(members, task.assigned_to);
  const taskPunch = taskPunches.get(task.id);
  const lateStartMinutes = startedLateMinutes(task, taskPunch?.started_at);
  const completionNote = completionNotes.get(task.id);
  const refusalHistory = refusalsByTask.get(task.id) ?? [];
  const refusal = currentTaskRefusal(task, refusalHistory);
  const cancellation = currentTaskCancellation(task);

  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <RecordHistoryMenu entityType="task" entityId={task.id} related={[{ type: "recurrence", id: task.recurrence_id }]} title={task.title}>
    <li
      data-task-id={task.id}
      className="space-y-2 px-3 py-3"
      draggable={isManager}
      onDragStart={(event) => {
        if (!isManager) return;
        event.dataTransfer.setData("text/task-id", task.id);
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex min-w-0 items-start gap-2">
          {isManager && onToggleTaskSelection && (
            <input
              type="checkbox"
              aria-label={`Selecionar tarefa ${task.title}`}
              checked={selectedTaskIds?.has(task.id) ?? false}
              onChange={() => onToggleTaskSelection(task.id)}
              className="mt-1 h-4 w-4 accent-primary"
            />
          )}
          <div className="min-w-0">
            <div className="break-words text-sm font-semibold leading-snug">{taskHeading(task)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {start || end ? (
                <span className="font-mono">
                  {start || "--:--"} → {end || "--:--"}
                </span>
              ) : dateOnly ? (
                <span>{dateOnly} · Sem horario definido</span>
              ) : (
                <span className="italic">Sem horário definido</span>
              )}
              <ScheduleNameBadge name={task.schedule_name} />
              {taskPunch && <PauseSummary entry={taskPunch} />}
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium ${operationalStatus === "atrasada" ? "bg-destructive/15 text-destructive" : STATUS_TONE[operationalStatus]}`}
              >
                {operationalStatus === "atrasada" ? "Atrasada" : STATUS_LABELS[operationalStatus]}
              </span>
            </div>
            {/* Gestor: endereço e instruções ficam no lápis (área de ações); funcionário vê sempre. */}
            {!isManager && <TaskClientDetails task={task} />}
          </div>
        </div>
        {isManager && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            title={actionsOpen ? "Ocultar ações" : "Editar e mais ações"}
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {lateStartMinutes != null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
            <Clock className="h-3 w-3" /> Início com atraso · {formatStartedLateMinutes(lateStartMinutes)}
          </span>
        ) : late && operationalStatus !== "atrasada" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
            <Clock className="h-3 w-3" /> atrasado
          </span>
        ) : null}
        {task.task_group_id && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            title="Tarefa criada em equipe: cada responsável tem a sua própria tarefa, com ponto e conclusão independentes."
          >
            <Users className="h-3 w-3" />
            <span className="truncate">{groupMemberNames?.get(task.task_group_id) ?? "Em equipe"}</span>
          </span>
        )}
        {task.recurrence_id && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            title={AUTO_RECURRENCE_BADGE_TITLE}
          >
            <Repeat className="h-3 w-3" /> {AUTO_RECURRENCE_BADGE_LABEL}
          </span>
        )}
      </div>
      {refusal && (
        <div className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px]">
          <div className="font-semibold uppercase tracking-wide text-destructive">
            Recusada · {memberNames.get(refusal.employeeId) ?? memberName}
          </div>
          <div className="whitespace-pre-wrap break-words">Motivo: {refusal.reason ?? "Motivo não registrado"}</div>
          {refusal.refusedAt && (
            <div className="text-muted-foreground">Recusada em: {formatLocalTime(refusal.refusedAt)}</div>
          )}
          {refusal.requestedDate && (
            <div>
              Nova data: {formatWallDate(refusal.requestedDate)}
              {refusal.requestedTime ? ` · ${refusal.requestedTime}` : ""}
            </div>
          )}
          {refusal.needsReassignment != null && <div>Reatribuição: {refusal.needsReassignment ? "Sim" : "Não"}</div>}
          {(refusal.suggestedEmployeeName || refusal.suggestedEmployeeId) && (
            <div>
              Sugestão (informativa):{" "}
              {refusal.suggestedEmployeeName ??
                (refusal.suggestedEmployeeId
                  ? (memberNames.get(refusal.suggestedEmployeeId) ?? "Sem responsável")
                  : "Sem responsável")}
            </div>
          )}
        </div>
      )}
      {cancellation && (
        <div className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px]">
          <div className="font-semibold uppercase tracking-wide text-destructive">
            {cancellation.byEmployee ? "Cancelada pelo funcionário" : "Tarefa cancelada"}
          </div>
          <div className="whitespace-pre-wrap break-words">
            Motivo: {cancellation.reason ?? "Motivo não registrado"}
          </div>
          {cancellation.cancelledAt && (
            <div className="text-muted-foreground">Cancelada em: {formatLocalTime(cancellation.cancelledAt)}</div>
          )}
          {cancellation.requestedDate && (
            <div>
              Nova data: {formatWallDate(cancellation.requestedDate)}
              {cancellation.requestedTime ? ` · ${cancellation.requestedTime}` : ""}
            </div>
          )}
          {cancellation.needsReassignment != null && (
            <div>Reatribuição: {cancellation.needsReassignment ? "Sim" : "Não"}</div>
          )}
          {(cancellation.suggestedEmployeeName || cancellation.suggestedEmployeeId) && (
            <div>
              Sugestão (informativa):{" "}
              {cancellation.suggestedEmployeeName ??
                (cancellation.suggestedEmployeeId
                  ? (memberNames.get(cancellation.suggestedEmployeeId) ?? "Sem responsável")
                  : "Sem responsável")}
            </div>
          )}
        </div>
      )}
      {completionNote && (
        <CompletionNoteBlock
          note={completionNote}
          memberNames={memberNames}
          assignedTo={task.assigned_to}
          completedAt={task.completed_at}
          compact
        />
      )}
      <TaskRefusalHistory records={refusalHistory} memberNames={memberNames} compact />

      {isManager && actionsOpen && <TaskClientDetails task={task} />}
      {(isManager
        ? actionsOpen
        : actions.length > 0 ||
          (onNoStartReason && (task.status === "pendente" || task.status === "autorizado") && late)) && (
        <div className="flex flex-wrap justify-end gap-1">
          {isManager && (
            <>
              <Button size="sm" variant="outline" title="Editar tarefa" onClick={() => onEdit(task)}>
                <Pencil className="h-3 w-3" />
                <span className="ml-1">Editar</span>
              </Button>
              {task.recurrence_id && (
                <Button size="sm" variant="ghost" title="Editar série" onClick={() => onEditSeries(task)}>
                  <Repeat className="h-3 w-3" />
                </Button>
              )}
              <Button size="sm" variant="ghost" title="Reatribuir" onClick={() => onReassign(task)}>
                <UserCog className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Excluir tarefa"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(task)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
          {onNoStartReason && (task.status === "pendente" || task.status === "autorizado") && late && (
            <Button
              size="sm"
              variant="ghost"
              title="Registar motivo de não ter iniciado"
              onClick={() => onNoStartReason(task)}
            >
              <FileText className="h-3 w-3" />
              <span className="ml-1 hidden sm:inline">Motivo</span>
            </Button>
          )}
          {actions.map((action) => (
            <ActionButton
              key={action}
              action={action}
              disabled={transitionPending}
              onClick={() => onTransition(task, action)}
            />
          ))}
        </div>
      )}
    </li>
    </RecordHistoryMenu>
  );
}
