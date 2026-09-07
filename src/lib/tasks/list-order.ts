type TaskListDateFields = {
  scheduled_for?: string | null;
  recurrence_date?: string | null;
  due_at?: string | null;
  created_at?: string | null;
};

const taskDateSource = (task: TaskListDateFields) =>
  task.scheduled_for ?? task.recurrence_date ?? task.due_at ?? task.created_at ?? null;

export function taskListTimestamp(task: TaskListDateFields): number {
  const source = taskDateSource(task);
  if (!source) return Number.POSITIVE_INFINITY;
  const normalized = source.length === 10 ? `${source}T00:00:00.000Z` : source;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

/**
 * Canonical task order: scheduled date/time ascending, then the fallback date.
 * Invalid or undated tasks remain visible at the end instead of disappearing.
 */
export function compareTasksForList(
  a: TaskListDateFields,
  b: TaskListDateFields,
): number {
  const aTimestamp = taskListTimestamp(a);
  const bTimestamp = taskListTimestamp(b);
  const aValid = Number.isFinite(aTimestamp);
  const bValid = Number.isFinite(bTimestamp);
  if (aValid !== bValid) return aValid ? -1 : 1;
  if (aValid && aTimestamp !== bTimestamp) return aTimestamp - bTimestamp;

  const aCreated = Date.parse(a.created_at ?? "");
  const bCreated = Date.parse(b.created_at ?? "");
  if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
    return aCreated - bCreated;
  }
  return 0;
}

export function sortTasksForList<T extends TaskListDateFields>(tasks: readonly T[]) {
  return [...tasks].sort(compareTasksForList);
}
