export type DashboardTaskSnapshot = {
  status: "pendente" | "autorizado" | "em_andamento" | "concluido" | "cancelado" | "ausente" | string;
  scheduled_for?: string | null;
  started_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  refused_by?: string | null;
};

const ACTIVE_STATUSES = new Set(["pendente", "autorizado", "em_andamento"]);

/** A refusal is stored as cancelled but remains a separate dashboard category. */
export function isDashboardCancelled(task: DashboardTaskSnapshot): boolean {
  return task.status === "cancelado" && !task.refused_by && !task.archived_at && !task.deleted_at;
}

/**
 * Dashboard semantics: late means late start, never late finish.
 * Tasks without a scheduled start cannot be classified as late by this rule.
 * A no-start task leaves the late bucket after the existing +24h absence window.
 */
export function isDashboardLateStart(task: DashboardTaskSnapshot, now = new Date()): boolean {
  if (
    !ACTIVE_STATUSES.has(task.status) ||
    task.archived_at ||
    task.deleted_at ||
    isDashboardCancelled(task)
  ) {
    return false;
  }

  const scheduledStart = task.scheduled_for ? new Date(task.scheduled_for) : null;
  if (!scheduledStart || !Number.isFinite(scheduledStart.getTime())) return false;

  if (task.started_at) {
    const actualStart = new Date(task.started_at);
    return Number.isFinite(actualStart.getTime()) && actualStart.getTime() > scheduledStart.getTime();
  }

  const nowMs = now.getTime();
  const scheduledMs = scheduledStart.getTime();
  return nowMs >= scheduledMs && nowMs < scheduledMs + 24 * 60 * 60 * 1000;
}
