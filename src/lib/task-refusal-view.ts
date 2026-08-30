export interface TaskRefusalRecord {
  id: string;
  company_id: string;
  task_id: string;
  employee_id: string;
  actor_id: string;
  reason: string;
  previous_status: string;
  new_status: string;
  created_at: string;
}

type RefusedTaskSnapshot = {
  status: string;
  assigned_to?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  refusal_reason?: string | null;
  refused_at?: string | null;
  refused_by?: string | null;
};

export interface TaskRefusalDetails {
  employeeId: string;
  reason: string | null;
  refusedAt: string | null;
}

export interface TaskRejectionNotificationDetails extends TaskRefusalDetails {
  employeeName: string | null;
}

export interface TaskCancellationDetails {
  cancelledBy: string | null;
  reason: string | null;
  cancelledAt: string | null;
  byEmployee: boolean;
}

function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function groupTaskRefusals(
  rows: TaskRefusalRecord[],
): ReadonlyMap<string, TaskRefusalRecord[]> {
  const grouped = new Map<string, TaskRefusalRecord[]>();
  for (const row of rows) {
    const taskRows = grouped.get(row.task_id) ?? [];
    taskRows.push(row);
    grouped.set(row.task_id, taskRows);
  }
  for (const taskRows of grouped.values()) {
    taskRows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }
  return grouped;
}

/**
 * Returns only the active employee refusal. Historical refusals are deliberately
 * kept separate so a later manager cancellation is never labelled as a refusal.
 */
export function currentTaskRefusal(
  task: RefusedTaskSnapshot,
  history: readonly TaskRefusalRecord[],
): TaskRefusalDetails | null {
  const employeeId = nonBlank(task.refused_by);
  if (task.status !== "cancelado" || !employeeId) return null;

  const matchingHistory = history.find((row) => row.employee_id === employeeId);
  return {
    employeeId,
    reason: nonBlank(task.refusal_reason) ?? nonBlank(matchingHistory?.reason),
    refusedAt: nonBlank(task.refused_at) ?? nonBlank(matchingHistory?.created_at),
  };
}

export function currentTaskCancellation(task: RefusedTaskSnapshot): TaskCancellationDetails | null {
  if (task.status !== "cancelado" || nonBlank(task.refused_by)) return null;
  const cancelledBy = nonBlank(task.cancelled_by);
  return {
    cancelledBy,
    reason: nonBlank(task.cancellation_reason),
    cancelledAt: nonBlank(task.cancelled_at),
    byEmployee: !!cancelledBy && cancelledBy === nonBlank(task.assigned_to),
  };
}

export function taskRejectionNotificationDetails(
  event: string,
  metadata: Record<string, unknown> | null | undefined,
): TaskRejectionNotificationDetails | null {
  if (event !== "task_rejected" || !metadata) return null;
  const employeeId = nonBlank(metadata.refused_by);
  if (!employeeId) return null;

  return {
    employeeId,
    employeeName: nonBlank(metadata.employee_name),
    reason: nonBlank(metadata.refusal_reason),
    refusedAt: nonBlank(metadata.refused_at),
  };
}
