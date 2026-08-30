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
