export type TaskListSort = "recent" | "nearest" | "oldest";

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
  if (!source) return Number.NEGATIVE_INFINITY;
  const normalized = source.length === 10 ? `${source}T00:00:00` : source;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function sortTasksForList<T extends TaskListDateFields>(
  tasks: readonly T[],
  sort: TaskListSort = "recent",
  now = Date.now(),
) {
  return [...tasks].sort((a, b) => {
    const aTimestamp = taskListTimestamp(a);
    const bTimestamp = taskListTimestamp(b);

    if (sort === "nearest") {
      const aValid = Number.isFinite(aTimestamp);
      const bValid = Number.isFinite(bTimestamp);
      if (aValid !== bValid) return aValid ? -1 : 1;
      if (aValid && bValid) {
        const distance = Math.abs(aTimestamp - now) - Math.abs(bTimestamp - now);
        if (distance !== 0) return distance;
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
  });
}
