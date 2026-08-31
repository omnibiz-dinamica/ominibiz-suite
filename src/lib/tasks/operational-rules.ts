export type OperationalTaskStatus = "pendente" | "autorizado" | "em_andamento" | "concluido" | "cancelado" | "ausente";

export function automaticAbsenceAllowedAt(task: { scheduled_for: string | null | undefined }): Date | null {
  if (!task.scheduled_for) return null;
  return new Date(new Date(task.scheduled_for).getTime() + 24 * 60 * 60 * 1000);
}

export function isSingleTask(t: { recurrence_id?: string | null }): boolean {
  return !t.recurrence_id;
}

export function isBulkArchiveEligible(
  task: { status: OperationalTaskStatus; archived_at?: string | null; recurrence_id?: string | null },
): boolean {
  return isSingleTask(task) && !task.archived_at && ["concluido", "cancelado", "ausente"].includes(task.status);
}

export function isBulkDeleteEligible(task: { status: OperationalTaskStatus; recurrence_id?: string | null }): boolean {
  return isSingleTask(task) && ["pendente", "autorizado", "cancelado", "ausente"].includes(task.status);
}
