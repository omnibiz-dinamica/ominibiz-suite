export type TaskCancellationNotificationDetails = {
  actorName: string;
  actorRole: string | null;
  taskTitle: string | null;
  clientName: string | null;
  reason: string | null;
  cancelledAt: string | null;
  requestedDate: string | null;
  needsReassignment: boolean | null;
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function taskCancellationNotificationDetails(
  event: string,
  metadata: Record<string, unknown> | null | undefined,
): TaskCancellationNotificationDetails | null {
  if (event !== "task_cancelled" || !metadata) return null;
  const actorName = textValue(metadata.cancelled_by_name);
  if (!actorName) return null;
  return {
    actorName,
    actorRole: textValue(metadata.cancelled_by_role),
    taskTitle: textValue(metadata.task_title),
    clientName: textValue(metadata.client_name),
    reason: textValue(metadata.cancellation_reason),
    cancelledAt: textValue(metadata.cancelled_at),
    requestedDate: textValue(metadata.schedule_change_requested_date),
    needsReassignment:
      typeof metadata.schedule_change_needs_reassignment === "boolean"
        ? metadata.schedule_change_needs_reassignment
        : null,
  };
}
