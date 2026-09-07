import { wallISOToDateInput } from "../wall-clock.ts";
import { sortTasksForList } from "./list-order.ts";

export type CalendarTaskAssignment = {
  assigned_to: string | null;
  scheduled_for?: string | null;
  recurrence_date?: string | null;
  due_at?: string | null;
};

export type CalendarVacationAssignment = {
  user_id: string;
};

/** Applies the page employee filter before calendar grouping/rendering. */
export function filterCalendarData<
  T extends CalendarTaskAssignment,
  V extends CalendarVacationAssignment,
>(tasks: T[], vacations: V[], employeeFilter: string | readonly string[] | undefined) {
  const employeeIds = Array.isArray(employeeFilter) ? employeeFilter : employeeFilter ? [employeeFilter] : [];
  if (employeeIds.length === 0) return { tasks, vacations };
  const selected = new Set(employeeIds);

  return {
    tasks: tasks.filter((task) => task.assigned_to != null && selected.has(task.assigned_to)),
    vacations: vacations.filter((vacation) => selected.has(vacation.user_id)),
  };
}

/** Uses the same wall-clock date source as the task calendar. */
export function taskCalendarDateKey(task: CalendarTaskAssignment): string | null {
  const source = task.scheduled_for ?? task.recurrence_date ?? task.due_at;
  return wallISOToDateInput(source) || null;
}

/** Returns the canonical task order for a calendar day without mutating input. */
export function tasksForCalendarDay<T extends CalendarTaskAssignment>(tasks: readonly T[], dateKey: string) {
  return sortTasksForList(tasks.filter((task) => taskCalendarDateKey(task) === dateKey));
}
