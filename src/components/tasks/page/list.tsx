// Tarefas · lista, agrupamento e linha de tarefa com as suas ações (extraído de app.tarefas.tsx).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { RecordHistoryMenu } from "@/components/history/RecordHistoryMenu";
import { Play, Check, X, ShieldCheck, UserX, Clock, Pencil, Repeat, UserCog, Users, Trash2, Archive, ArchiveRestore, Building2, FileText, Ban, MapPin as MapPinIcon } from "lucide-react";
import { STATUS_LABELS, STATUS_TONE, type TaskAction, type TaskRow, ACTION_LABELS, availableActions, formatStartedLateMinutes, isVisuallyLate, resolveOperationalStatus, startedLateMinutes, canArchive, canMarkAbsent, pauseMinutesNow, formatDuration, type TimeEntryRow, AUTO_RECURRENCE_BADGE_LABEL, AUTO_RECURRENCE_BADGE_TITLE } from "@/lib/tasks";

import { currentTaskCancellation, currentTaskRefusal, type TaskRefusalRecord } from "@/lib/task-refusal-view";

import { useT } from "@/i18n";
import { SearchX } from "lucide-react";
import { compareTasksForList, sortTasksForList } from "@/lib/tasks/list-order";
import { formatWallDate, formatWallTime, formatLocalTime } from "@/lib/wall-clock";
import { ClientOption, clientAddressCache, taskClientInstructions, taskHeading, CompletionNote, taskMemberName, RowHandlers, tasksRouteApi } from "./shared";
import { ScheduleNameBadge, TaskClientDetails } from "./calendar";
import { tr } from "@/i18n";

export function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full px-3 py-1 text-xs font-medium transition " +
        (active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

export function TaskListSections({
  tasks,
  splitCompleted,
  members,
  clients,
  groupBy,
  ...handlers
}: RowHandlers & {
  tasks: TaskRow[];
  splitCompleted: boolean;
  members: { id: string; full_name: string | null }[];
  clients: ClientOption[];
  groupBy: "assignee" | "client" | "all";
}) {
  const openTasks = tasks.filter((task) => task.status !== "concluido");
  const completedTasks = tasks.filter((task) => task.status === "concluido");

  const renderTasks = (items: TaskRow[]) => {
    if (items.length === 0) return null;
    if (groupBy === "all") {
      return (
        <div className="rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {items.map((task) => (
              <TaskRowItem key={task.id} task={task} {...handlers} />
            ))}
          </ul>
        </div>
      );
    }
    return <GroupedTaskList tasks={items} members={members} clients={clients} groupBy={groupBy} {...handlers} />;
  };

  if (!splitCompleted) return renderTasks(tasks);

  return (
    <div className="space-y-5">
      {openTasks.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-base font-semibold">{tr("Tarefas em aberto")}</h2>
          {renderTasks(openTasks)}
        </section>
      )}
      {completedTasks.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-base font-semibold">{tr("Tarefas concluídas")}</h2>
          {renderTasks(completedTasks)}
        </section>
      )}
    </div>
  );
}

export function GroupedTaskList({
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
  const labelOf = (id: string | null) => {
    if (groupBy === "client") {
      return clients.find((client) => client.id === id)?.name ?? (id ? id.slice(0, 8) : "Sem cliente");
    }
    return taskMemberName(members, id);
  };

  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const k =
      (groupBy === "client" ? t.client_id : t.assigned_to) ??
      (groupBy === "client" ? "__no_client__" : "__unassigned__");
    const arr = groups.get(k) ?? [];
    arr.push(t);
    groups.set(k, arr);
  }
  const entries = Array.from(groups.entries()).sort(([a, tasksA], [b, tasksB]) => {
    const firstA = sortTasksForList(tasksA)[0];
    const firstB = sortTasksForList(tasksB)[0];
    if (firstA && firstB) {
      const nextTaskOrder = compareTasksForList(firstA, firstB);
      if (nextTaskOrder !== 0) return nextTaskOrder;
    }
    const emptyKey = groupBy === "client" ? "__no_client__" : "__unassigned__";
    return labelOf(a === emptyKey ? null : a).localeCompare(labelOf(b === emptyKey ? null : b));
  });

  // Notificação: o grupo que contém a tarefa aberta já começa expandido.
  const groupFocusTaskId = tasksRouteApi.useSearch().task;
  const groupFocusTask = groupFocusTaskId ? tasks.find((t) => t.id === groupFocusTaskId) : undefined;
  const groupFocusKey = groupFocusTask
    ? ((groupBy === "client" ? groupFocusTask.client_id : groupFocusTask.assigned_to) ??
      (groupBy === "client" ? "__no_client__" : "__unassigned__"))
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <Accordion
        type="multiple"
        className="divide-y divide-border"
        defaultValue={groupFocusKey ? [groupFocusKey] : undefined}
      >
        {entries.map(([key, list]) => {
          const emptyKey = groupBy === "client" ? "__no_client__" : "__unassigned__";
          const name = labelOf(key === emptyKey ? null : key);
          return (
            <AccordionItem key={key} value={key} className="border-b-0">
              <AccordionTrigger className="px-5 hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {groupBy === "client" ? <Building2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                  </span>
                  <span className="font-display text-base font-semibold">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({list.length} {list.length === 1 ? "tarefa" : "tarefas"})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <ul className="divide-y divide-border border-t border-border">
                  {list.map((t) => (
                    <TaskRowItem key={t.id} task={t} {...handlers} />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

export function TaskRefusalHistory({
  records,
  memberNames,
  compact = false,
}: {
  records: readonly TaskRefusalRecord[];
  memberNames: ReadonlyMap<string, string>;
  compact?: boolean;
}) {
  if (records.length === 0) return null;

  return (
    <details className={compact ? "text-[11px]" : "mt-2 text-xs"}>
      <summary className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline">
        {tr("Histórico de recusas (")}{records.length})
      </summary>
      <div className="mt-2 space-y-2 border-l-2 border-destructive/25 pl-3">
        {records.map((record) => (
          <div key={record.id} className="space-y-0.5">
            <div className="font-medium text-foreground">
              {memberNames.get(record.employee_id) ?? tr("Funcionário")} · {formatLocalTime(record.created_at)}
            </div>
            <div className="whitespace-pre-wrap break-words text-muted-foreground">{record.reason}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

export function TaskRowItem({
  task: t,
  userId,
  isManager,
  onEdit,
  onEditSeries,
  onReassign,
  onDelete,
  onTransition,
  onArchive,
  transitionPending,
  archivePending,
  completionNotes,
  refusalsByTask,
  memberNames,
  groupMemberNames,
  selectedTaskIds,
  onToggleTaskSelection,
  onNoStartReason,
  taskPunches,
}: RowHandlers & { task: TaskRow }) {
  const late = isVisuallyLate(t);
  const operationalStatus = resolveOperationalStatus(t);
  const actions = availableActions(t, { userId, isManager });
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const hasClientInfo = !!(t.client_id && clientAddressCache.has(t.client_id)) || !!taskClientInstructions(t);
  const archived = !!t.archived_at;
  const archivable = canArchive(t);
  const completionNote = completionNotes.get(t.id);
  const date = formatWallDate(t.scheduled_for ?? t.recurrence_date ?? t.due_at);
  const start = formatWallTime(t.scheduled_for);
  const end = formatWallTime(t.scheduled_end);
  const updated = formatLocalTime(t.updated_at);
  const refusalHistory = refusalsByTask.get(t.id) ?? [];
  const refusal = currentTaskRefusal(t, refusalHistory);
  const cancellation = currentTaskCancellation(t);
  const taskPunch = taskPunches.get(t.id);
  const lateStartMinutes = startedLateMinutes(t, taskPunch?.started_at);

  return (
    <RecordHistoryMenu entityType="task" entityId={t.id} related={[{ type: "recurrence", id: t.recurrence_id }]} title={t.title}>
    <li data-task-id={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {isManager && onToggleTaskSelection && (
          <input
            type="checkbox"
            aria-label={`Selecionar tarefa ${t.title}`}
            checked={selectedTaskIds?.has(t.id) ?? false}
            onChange={() => onToggleTaskSelection(t.id)}
            className="mt-1 h-4 w-4 accent-primary"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{taskHeading(t)}</span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${operationalStatus === "atrasada" ? "bg-destructive/15 text-destructive" : STATUS_TONE[operationalStatus]}`}
            >
              {operationalStatus === "atrasada" ? tr("Atrasada") : tr(STATUS_LABELS[operationalStatus])}
            </span>
            {lateStartMinutes != null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                <Clock className="h-3 w-3" /> {tr("Início com atraso ·")} {formatStartedLateMinutes(lateStartMinutes)}
              </span>
            ) : late && operationalStatus !== "atrasada" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                <Clock className="h-3 w-3" /> atrasado
              </span>
            ) : null}
            {t.recurrence_id && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                title={AUTO_RECURRENCE_BADGE_TITLE}
              >
                <Repeat className="h-3 w-3" /> {AUTO_RECURRENCE_BADGE_LABEL}
              </span>
            )}
            {t.task_group_id && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                title={tr("Tarefa criada em equipe: cada responsável tem a sua própria tarefa, com ponto e conclusão independentes.")}
              >
                <Users className="h-3 w-3" />
                <span className="truncate">{groupMemberNames?.get(t.task_group_id) ?? tr("Em equipe")}</span>
              </span>
            )}
            <ScheduleNameBadge name={t.schedule_name} />
          </div>
          {/* Gestor: endereço e instruções só ao clicar no botão do mapa; funcionário vê sempre. */}
          {(!isManager || clientInfoOpen) && <TaskClientDetails task={t} />}
          {refusal && (
            <div className="mt-2 space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
              <div className="font-semibold uppercase tracking-wide text-destructive">{tr("Recusada pelo funcionário")}</div>
              <div className="whitespace-pre-wrap break-words">
                {tr("Funcionário:")} {memberNames.get(refusal.employeeId) ?? tr("Funcionário")}
              </div>
              <div className="whitespace-pre-wrap break-words">{tr("Motivo:")} {refusal.reason ?? tr("Motivo não registrado")}</div>
              {refusal.refusedAt && (
                <div className="text-muted-foreground">{tr("Recusada em:")} {formatLocalTime(refusal.refusedAt)}</div>
              )}
              {refusal.requestedDate && (
                <div>
                  {tr("Nova data desejada:")} {formatWallDate(refusal.requestedDate)}
                  {refusal.requestedTime ? ` · ${refusal.requestedTime}` : ""}
                </div>
              )}
              {refusal.needsReassignment != null && (
                <div>{tr("Reatribuição necessária:")} {refusal.needsReassignment ? tr("Sim") : tr("Não")}</div>
              )}
              {(refusal.suggestedEmployeeName || refusal.suggestedEmployeeId) && (
                <div>
                  {tr("Funcionário sugerido (informativo):")}{" "}
                  {refusal.suggestedEmployeeName ??
                    (refusal.suggestedEmployeeId
                      ? (memberNames.get(refusal.suggestedEmployeeId) ?? tr("Sem responsável"))
                      : tr("Sem responsável"))}
                </div>
              )}
              {isManager && (
                <button
                  type="button"
                  className="mt-1 font-medium text-primary underline underline-offset-2"
                  onClick={() => onReassign(t)}
                >
                  {tr("Reatribuir tarefa")}
                </button>
              )}
            </div>
          )}
          {cancellation && (
            <div className="mt-2 space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
              <div className="font-semibold uppercase tracking-wide text-destructive">
                {cancellation.byEmployee ? tr("Cancelada pelo funcionário") : tr("Tarefa cancelada")}
              </div>
              <div className="whitespace-pre-wrap break-words">
                {tr("Motivo:")} {cancellation.reason ?? tr("Motivo não registrado")}
              </div>
              {cancellation.cancelledAt && (
                <div className="text-muted-foreground">{tr("Cancelada em:")} {formatLocalTime(cancellation.cancelledAt)}</div>
              )}
              {cancellation.requestedDate && (
                <div>
                  {tr("Nova data desejada:")} {formatWallDate(cancellation.requestedDate)}
                  {cancellation.requestedTime ? ` · ${cancellation.requestedTime}` : ""}
                </div>
              )}
              {cancellation.needsReassignment != null && (
                <div>{tr("Reatribuição necessária:")} {cancellation.needsReassignment ? tr("Sim") : tr("Não")}</div>
              )}
              {(cancellation.suggestedEmployeeName || cancellation.suggestedEmployeeId) && (
                <div>
                  {tr("Funcionário sugerido (informativo):")}{" "}
                  {cancellation.suggestedEmployeeName ??
                    (cancellation.suggestedEmployeeId
                      ? (memberNames.get(cancellation.suggestedEmployeeId) ?? tr("Sem responsável"))
                      : tr("Sem responsável"))}
                </div>
              )}
            </div>
          )}
          <TaskRefusalHistory records={refusalHistory} memberNames={memberNames} />
          {operationalStatus === "ausente" && (
            <div className="mt-2 space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
              <div className="font-semibold uppercase tracking-wide text-destructive">
                {t.absence_source === "employee"
                  ? tr("Falta registada pelo funcionário")
                  : t.absence_source === "manual"
                    ? tr("Falta registada pelo gestor")
                    : tr("Ausência automática")}
              </div>
              {t.absence_reason ? (
                <div>
                  {tr("Motivo:")} {t.absence_reason}
                  {t.absence_justified != null && (t.absence_justified ? tr(" · justificada") : tr(" · injustificada"))}
                </div>
              ) : (
                <div className="text-muted-foreground">{tr("Falta ainda sem motivo registado.")}</div>
              )}
              {t.marked_absent_at && (
                <div className="text-muted-foreground">{tr("Marcada em:")} {formatLocalTime(t.marked_absent_at)}</div>
              )}
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {date && <span>{date}</span>}
            {start || end ? (
              <span className="font-mono">
                {start || "--:--"} → {end || "--:--"}
              </span>
            ) : (
              !t.scheduled_for && <span className="italic">{tr("Sem horário definido")}</span>
            )}
            {updated && <span>{tr("Atualizado:")} {updated}</span>}
            {taskPunch && <PauseSummary entry={taskPunch} />}
          </div>
          {t.description && <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.description}</div>}
          {completionNote && (
            <CompletionNoteBlock
              note={completionNote}
              memberNames={memberNames}
              assignedTo={t.assigned_to}
              completedAt={t.completed_at}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {isManager && (
          <>
            <Button size="sm" variant="ghost" title={tr("Editar")} onClick={() => onEdit(t)}>
              <Pencil className="h-3 w-3" />
            </Button>
            {hasClientInfo && (
              <Button
                size="sm"
                variant={clientInfoOpen ? "secondary" : "ghost"}
                title={clientInfoOpen ? tr("Ocultar endereço e instruções") : tr("Ver endereço e instruções")}
                aria-expanded={clientInfoOpen}
                onClick={() => setClientInfoOpen((open) => !open)}
              >
                <MapPinIcon className="h-3 w-3" />
              </Button>
            )}
            {t.recurrence_id && (
              <Button size="sm" variant="ghost" title={tr("Editar série")} onClick={() => onEditSeries(t)}>
                <Repeat className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" title={tr("Reatribuir")} onClick={() => onReassign(t)}>
              <UserCog className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title={
                t.status === "em_andamento" || t.status === "concluido"
                  ? tr("Tarefa com histórico operacional — não pode ser excluída")
                  : tr("Excluir tarefa")
              }
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(t)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            {archived ? (
              <Button
                size="sm"
                variant="ghost"
                title={tr("Desarquivar")}
                disabled={archivePending}
                onClick={() => onArchive(t.id, false)}
              >
                <ArchiveRestore className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                title={
                  archivable ? tr("Arquivar") : tr("Apenas tarefas concluídas, canceladas ou ausentes podem ser arquivadas")
                }
                disabled={archivePending || !archivable}
                onClick={() => onArchive(t.id, true)}
              >
                <Archive className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
        {/* ADR-044 — falta continua acessível em 'em andamento' e para completar o registo de ausências automáticas. */}
        {!actions.includes("marcar_ausente") && canMarkAbsent(t, { isManager, userId }) && (
          <Button
            size="sm"
            variant="ghost"
            title={t.status === "ausente" ? tr("Registar motivo da falta") : tr("Marcar falta")}
            onClick={() => onTransition(t, "marcar_ausente")}
          >
            <UserX className="h-3 w-3" />
            <span className="ml-1 hidden sm:inline">{t.status === "ausente" ? tr("Registar falta") : tr("Marcar falta")}</span>
          </Button>
        )}
        {onNoStartReason && (t.status === "pendente" || t.status === "autorizado") && late && (
          <Button
            size="sm"
            variant="ghost"
            title={tr("Registar motivo de não ter iniciado")}
            onClick={() => onNoStartReason(t)}
          >
            <FileText className="h-3 w-3" />
            <span className="ml-1 hidden sm:inline">{tr("Motivo")}</span>
          </Button>
        )}
        {actions.map((a) => (
          <ActionButton key={a} action={a} disabled={transitionPending} onClick={() => onTransition(t, a)} />
        ))}
      </div>
    </li>
    </RecordHistoryMenu>
  );
}

export function PauseSummary({ entry }: { entry: TimeEntryRow }) {
  const minutes = pauseMinutesNow(entry);
  if (minutes == null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-foreground">
      <Clock className="h-3 w-3" />
      {entry.paused_at && !entry.resumed_at && !entry.ended_at ? tr("Em pausa") : `Pausa ${formatDuration(minutes)}`}
    </span>
  );
}

export function ActionButton({ action, onClick, disabled }: { action: TaskAction; onClick: () => void; disabled?: boolean }) {
  const map = {
    autorizar: { Icon: ShieldCheck, variant: "outline" as const },
    iniciar: { Icon: Play, variant: "outline" as const },
    concluir: { Icon: Check, variant: "default" as const },
    recusar: { Icon: Ban, variant: "ghost" as const },
    marcar_ausente: { Icon: UserX, variant: "ghost" as const },
    cancelar: { Icon: X, variant: "ghost" as const },
  }[action];
  const { Icon, variant } = map;
  return (
    <Button size="sm" variant={variant} onClick={onClick} disabled={disabled} title={ACTION_LABELS[action]}>
      <Icon className="h-3 w-3" />
      <span className="ml-1 hidden sm:inline">{ACTION_LABELS[action]}</span>
    </Button>
  );
}

export function CompletionNoteBlock({
  note,
  memberNames,
  assignedTo,
  completedAt,
  compact = false,
}: {
  note: CompletionNote;
  memberNames: ReadonlyMap<string, string>;
  assignedTo: string | null;
  completedAt: string | null;
  compact?: boolean;
}) {
  const actorName = memberNames.get(note.actor_user_id) ?? "Funcionário";
  const byEmployee = assignedTo === note.actor_user_id;
  const timestamp = completedAt ?? note.created_at;

  return (
    <div
      className={`${compact ? "mt-2 px-2 py-1.5 text-[11px]" : "mt-2 px-3 py-2 text-xs"} rounded-md border border-success/30 bg-success/10`}
    >
      <div className="font-semibold uppercase tracking-wide text-success-foreground">
        {byEmployee ? tr("Concluída pelo funcionário") : tr("Observação da conclusão")}
      </div>
      <div className="mt-0.5 text-foreground">
        <span className="font-medium">{tr("Funcionário:")}</span> {actorName}
      </div>
      <div className="mt-0.5 whitespace-pre-wrap break-words text-foreground">
        <span className="font-medium">{tr("Observação:")}</span> {note.reason}
      </div>
      <div className="mt-1 text-muted-foreground">{tr("Concluída em:")} {formatLocalTime(timestamp)}</div>
    </div>
  );
}

/** Estado vazio do filtro de cliente (Lista e Calendário). */
export function ClientFilterEmptyState({ withOtherFilters, onClear }: { withOtherFilters: boolean; onClear?: () => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-5 py-10 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="max-w-md text-sm font-medium">
        {withOtherFilters
          ? t("Nenhuma tarefa encontrada para os clientes selecionados com os filtros selecionados neste período.")
          : t("Nenhuma tarefa encontrada para os clientes selecionados neste período.")}
      </p>
      <p className="max-w-md text-xs text-muted-foreground">{t("Tente outro período ou limpe o filtro de cliente.")}</p>
      {onClear && (
        <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={onClear}>
          {t("Limpar filtro de cliente")}
        </Button>
      )}
    </div>
  );
}
