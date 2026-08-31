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
>(tasks: T[], vacations: V[], employeeId: string | undefined) {
  if (!employeeId) return { tasks, vacations };

  return {
    tasks: tasks.filter((task) => task.assigned_to === employeeId),
    vacations: vacations.filter((vacation) => vacation.user_id === employeeId),
  };
}
