export type CalendarTaskAssignment = {
  assigned_to: string | null;
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
