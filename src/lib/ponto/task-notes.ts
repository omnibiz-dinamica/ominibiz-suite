import {
  currentTaskCancellation,
  currentTaskRefusal,
  groupTaskRefusals,
  type TaskRefusalRecord,
} from "../task-refusal-view.ts";

export type TaskOperationalNoteKind = "completion" | "cancellation" | "refusal";

export interface TaskOperationalNote {
  kind: TaskOperationalNoteKind;
  label: string;
  text: string;
  createdAt: string | null;
  requestedDate: string | null;
  needsReassignment: boolean | null;
}

export interface TaskNoteTaskSnapshot {
  id?: string;
  status: string | null;
  assigned_to?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  refusal_reason?: string | null;
  refused_at?: string | null;
  refused_by?: string | null;
  schedule_change_requested_date?: string | null;
  schedule_change_needs_reassignment?: boolean | null;
}

export interface TaskCompletionNoteEvent {
  task_id: string;
  reason: string | null;
  created_at: string;
}

export interface TaskCancellationNoteEvent {
  task_id: string;
  reason: string | null;
  created_at: string;
}

function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function latestWithReason<T extends { reason: string | null; created_at: string }>(
  rows: readonly T[],
) {
  return [...rows]
    .filter((row) => nonBlank(row.reason))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

function scheduleText(requestedDate: string | null, needsReassignment: boolean | null): string {
  return requestedDate || needsReassignment !== null ? "Alteração de programação solicitada" : "";
}

/**
 * Centraliza as notas que pertencem à tarefa/ocorrência, sem misturá-las com
 * notas do ponto. O task_id é a identidade da ocorrência materializada.
 */
export function resolveTaskOperationalNotes(input: {
  task: TaskNoteTaskSnapshot;
  completionEvents?: readonly TaskCompletionNoteEvent[];
  cancellationEvents?: readonly TaskCancellationNoteEvent[];
  refusals?: readonly TaskRefusalRecord[];
}): TaskOperationalNote[] {
  const notes: TaskOperationalNote[] = [];
  const taskId = input.task.id ?? "";
  const completion = latestWithReason(
    (input.completionEvents ?? []).filter((event) => event.task_id === taskId),
  );
  if (completion) {
    notes.push({
      kind: "completion",
      label: "Observação da conclusão",
      text: nonBlank(completion.reason) ?? "",
      createdAt: completion.created_at,
      requestedDate: null,
      needsReassignment: null,
    });
  }

  if (input.task.status !== "cancelado") return notes;

  const refusalHistory = (input.refusals ?? []).filter((refusal) => refusal.task_id === taskId);
  const grouped = groupTaskRefusals(refusalHistory);
  const taskForRules = { ...input.task, status: input.task.status ?? "" };
  const refusal = currentTaskRefusal(
    taskForRules,
    grouped.get(input.task.id ?? "") ?? refusalHistory,
  );
  if (refusal) {
    notes.push({
      kind: "refusal",
      label: "Motivo da recusa",
      text: refusal.reason ?? scheduleText(refusal.requestedDate, refusal.needsReassignment),
      createdAt: refusal.refusedAt,
      requestedDate: refusal.requestedDate,
      needsReassignment: refusal.needsReassignment,
    });
    return notes;
  }

  const cancellation = currentTaskCancellation(taskForRules);
  const fallback = latestWithReason(
    (input.cancellationEvents ?? []).filter((event) => event.task_id === taskId),
  );
  if (cancellation || fallback) {
    const requestedDate = cancellation?.requestedDate ?? null;
    const needsReassignment = cancellation?.needsReassignment ?? null;
    notes.push({
      kind: "cancellation",
      label: "Motivo do cancelamento",
      text:
        cancellation?.reason ?? fallback?.reason ?? scheduleText(requestedDate, needsReassignment),
      createdAt: cancellation?.cancelledAt ?? fallback?.created_at ?? null,
      requestedDate,
      needsReassignment,
    });
  }

  return notes;
}

export function formatCivilDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
