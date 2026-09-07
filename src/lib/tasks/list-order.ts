export type TaskListSort = "recent" | "nearest" | "oldest";

type TaskListDateFields = {
  scheduled_for?: string | null;
  recurrence_date?: string | null;
  due_at?: string | null;
  created_at?: string | null;
};

const taskDateSource = (task: TaskListDateFields) =>
  task.scheduled_for ?? task.recurrence_date ?? task.due_at ?? task.created_at ?? null;

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function taskListTimestamp(task: TaskListDateFields): number {
  const source = taskDateSource(task);
  if (!source) return Number.NEGATIVE_INFINITY;
  const normalized = source.length === 10 ? `${source}T00:00:00` : source;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/**
 * Orders the nearest view from today forward. Past tasks remain visible after
 * upcoming work, with the most recent past date first.
 */
export function compareTasksForList(
  a: TaskListDateFields,
  b: TaskListDateFields,
  sort: TaskListSort = "nearest",
  now = Date.now(),
): number {
  const aTimestamp = taskListTimestamp(a);
  const bTimestamp = taskListTimestamp(b);

  if (sort === "nearest") {
    const aValid = Number.isFinite(aTimestamp);
    const bValid = Number.isFinite(bTimestamp);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && bValid) {
      const today = localDateKey(new Date(now));
      const aDate = taskDateSource(a)?.slice(0, 10) ?? "";
      const bDate = taskDateSource(b)?.slice(0, 10) ?? "";
      const aBucket = aDate >= today ? 0 : 1;
      const bBucket = bDate >= today ? 0 : 1;
      if (aBucket !== bBucket) return aBucket - bBucket;

      // Upcoming dates ascend; past dates descend so yesterday precedes older history.
      const aOrder = aBucket === 0 ? aTimestamp : -aTimestamp;
      const bOrder = bBucket === 0 ? bTimestamp : -bTimestamp;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
  } else if (sort === "oldest") {
    if (aTimestamp !== bTimestamp) return aTimestamp - bTimestamp;
  } else if (aTimestamp !== bTimestamp) {
    return bTimestamp - aTimestamp;
  }

  const aCreated = Date.parse(a.created_at ?? "");
  const bCreated = Date.parse(b.created_at ?? "");
  if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
    return bCreated - aCreated;
  }
  return 0;
}

export function sortTasksForList<T extends TaskListDateFields>(
  tasks: readonly T[],
  sort: TaskListSort = "nearest",
  now = Date.now(),
) {
  return [...tasks].sort((a, b) => compareTasksForList(a, b, sort, now));
}
