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

const LINK_EVENTS = new Set(["punch_regularized", "punch_adjusted"]);

function safeInternalPath(value: unknown): string | null {
  const link = typeof value === "string" ? value.trim() : "";
  if (!link.startsWith("/app/") || link.startsWith("//") || link.includes("://")) return null;
  return link;
}

/** Link interno gravado no metadata para eventos que navegam por link. */
export function notificationOpenLink(n: OpenableNotification): string | null {
  if (!LINK_EVENTS.has(n.event)) return null;
  const meta = (n.metadata ?? {}) as Record<string, unknown>;
  return safeInternalPath(meta.link);
}

export type NotificationDestination =
  | { kind: "path"; to: string }
  | { kind: "ticket"; id: string }
  | { kind: "task"; taskId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SUP-147/150: destino do botão "Abrir". Usa o link gravado; se não houver,
 * deriva do metadata/task_id (só rotas internas). null => sem botão "Abrir".
 */
export function resolveNotificationDestination(
  n: OpenableNotification,
  supportTicketId: string | null,
): NotificationDestination | null {
  const meta = (n.metadata ?? {}) as Record<string, unknown>;
  if (LINK_EVENTS.has(n.event)) {
    const link = notificationOpenLink(n);
    return { kind: "path", to: link ?? "/app/ponto" };
  }
  if (n.event.startsWith("vacation_")) return { kind: "path", to: "/app/ferias" };
  if (n.event.startsWith("expense_")) return { kind: "path", to: "/app/despesas" };
  if (supportTicketId) return { kind: "ticket", id: supportTicketId };
  const taskId =
    n.task_id ?? (typeof meta.task_id === "string" && UUID.test(meta.task_id) ? meta.task_id : null);
  if (taskId) return { kind: "task", taskId };
  const link = safeInternalPath(meta.link) ?? safeInternalPath(meta.target_url);
  if (link) return { kind: "path", to: link };
  return null;
}

export function canOpenNotification(n: OpenableNotification, supportTicketId: string | null | boolean): boolean {
  const id = typeof supportTicketId === "string" ? supportTicketId : supportTicketId ? "ticket" : null;
  return resolveNotificationDestination(n, id) !== null;
}
