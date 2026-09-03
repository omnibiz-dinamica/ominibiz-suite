export type OperationalTaskStatus = "pendente" | "autorizado" | "em_andamento" | "concluido" | "cancelado" | "ausente";
export type ResolvedOperationalStatus = OperationalTaskStatus | "atrasada";

/** Converts the device's local wall clock into a comparable UTC-like value. */
export function wallClockEpoch(date: Date): number {
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

export function automaticAbsenceAllowedAt(task: { scheduled_for: string | null | undefined }): Date | null {
  if (!task.scheduled_for) return null;
  const start = new Date(task.scheduled_for);
  if (!Number.isFinite(start.getTime())) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Resolves the temporal state once for every UI consumer. Persisted terminal
 * states and permissions remain authoritative; only pending work receives a
 * time-derived state. `absence_source=automatica` also protects the UI from
 * showing an old premature automatic absence before its +24h threshold.
 */
export function resolveOperationalStatus(
  task: {
    status: OperationalTaskStatus;
    scheduled_for: string | null | undefined;
    recurrence_date?: string | null;
    due_at?: string | null;
    absence_source?: string | null;
  },
  now = new Date(),
): ResolvedOperationalStatus {
  const start = task.scheduled_for ? new Date(task.scheduled_for) : null;
  if (!start || !Number.isFinite(start.getTime())) {
    // Tarefas sem hora nunca entram no ciclo automático de ausência. Mantemos,
    // porém, a indicação visual legada de atraso no dia seguinte à ocorrência.
    if (task.status !== "pendente" && task.status !== "autorizado") return task.status;
    const dateSource = task.recurrence_date ?? task.due_at;
    const day = dateSource?.slice(0, 10);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return task.status;
    const nextDay = new Date(`${day}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return wallClockEpoch(now) >= nextDay.getTime() ? "atrasada" : task.status;
  }

  const isAutomaticAbsence = task.absence_source === "automatica" || task.absence_source === "automatic";
  if (task.status === "ausente" && isAutomaticAbsence) {
    const threshold = automaticAbsenceAllowedAt(task);
    if (threshold && wallClockEpoch(now) < threshold.getTime()) {
      return wallClockEpoch(now) >= start.getTime() ? "atrasada" : "pendente";
    }
    return task.status;
  }

  if (task.status !== "pendente" && task.status !== "autorizado") return task.status;
  const threshold = automaticAbsenceAllowedAt(task);
  if (threshold && wallClockEpoch(now) >= threshold.getTime()) return "ausente";
  if (wallClockEpoch(now) >= start.getTime()) return "atrasada";
  return task.status;
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
