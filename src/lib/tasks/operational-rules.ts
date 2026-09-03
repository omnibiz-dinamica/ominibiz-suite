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

/**
 * Returns the delay between the scheduled wall-clock start and the recorded
 * start. `scheduled_for` is stored as a wall-clock ISO value, while
 * `started_at` is a real timestamp captured by the punch flow.
 */
export function startedLateMinutes(task: {
  scheduled_for: string | null | undefined;
  started_at: string | null | undefined;
}): number | null {
  if (!task.scheduled_for || !task.started_at) return null;
  const scheduled = new Date(task.scheduled_for);
  const started = new Date(task.started_at);
  if (!Number.isFinite(scheduled.getTime()) || !Number.isFinite(started.getTime())) return null;

  const delayMinutes = Math.floor((wallClockEpoch(started) - scheduled.getTime()) / 60000);
  return delayMinutes > 0 ? delayMinutes : null;
}

export function formatStartedLateMinutes(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const remaining = total % 60;
  return remaining ? `${hours}h ${remaining}min` : `${hours}h`;
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
    absence_reason?: string | null;
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

  // Legacy rows may use another automatic label (or have no source at all).
  // Only explicit manual/employee sources must remain terminal immediately.
  const isAutomaticAbsence = task.absence_source !== "manual" && task.absence_source !== "employee";
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
