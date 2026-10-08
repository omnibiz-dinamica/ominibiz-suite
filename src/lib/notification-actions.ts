export type NotificationManagementState =
  | "nova"
  | "em_tratamento"
  | "encaminhada"
  | "resolvida"
  | "arquivada";

export type NotificationActionAvailability = {
  open: boolean;
  treat: boolean;
  forward: boolean;
  resolve: boolean;
  archive: boolean;
  restore: boolean;
};

export function canManageNotification({
  currentCompanyId,
  isManager,
  isSuperAdmin,
  notificationCompanyId,
}: {
  currentCompanyId: string | null;
  isManager: boolean;
  isSuperAdmin: boolean;
  notificationCompanyId: string;
}): boolean {
  return isSuperAdmin || (isManager && currentCompanyId === notificationCompanyId);
}

export function resolveNotificationActions({
  canManage,
  canOpen,
  state,
}: {
  canManage: boolean;
  canOpen: boolean;
  state: NotificationManagementState;
}): NotificationActionAvailability {
  const terminal = state === "resolvida" || state === "arquivada";

  return {
    open: canOpen,
    treat: canManage && !terminal && state !== "em_tratamento",
    forward: canManage && !terminal,
    resolve: canManage && !terminal,
    archive: state !== "arquivada",
    restore: canManage && state === "arquivada",
  };
}

type OpenableNotification = {
  event: string;
  task_id?: string | null;
  metadata?: unknown;
};

/** Link interno gravado no metadata para eventos que navegam por link (ex.: punch_regularized). */
export function notificationOpenLink(n: OpenableNotification): string | null {
  if (n.event !== "punch_regularized") return null;
  const meta = (n.metadata ?? {}) as Record<string, unknown>;
  const link = typeof meta.link === "string" ? meta.link.trim() : "";
  if (!link.startsWith("/app/") || link.startsWith("//")) return null;
  return link;
}

export function canOpenNotification(n: OpenableNotification, hasSupportTicket: boolean): boolean {
  return (
    n.event === "punch_regularized" ||
    !!n.task_id ||
    hasSupportTicket ||
    n.event.startsWith("vacation_") ||
    n.event.startsWith("expense_")
  );
}
