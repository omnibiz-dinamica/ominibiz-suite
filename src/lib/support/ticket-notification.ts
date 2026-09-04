export type TicketNotificationEvent = "ticket_created" | "ticket_message_added";

export type TicketNotificationIdentity = {
  fullName?: string | null;
  displayName?: string | null;
  email?: string | null;
};

export type TicketNotificationDisplay = {
  title: string;
  body: string | null;
  actorName: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function ticketNotificationActorName(
  metadata: Record<string, unknown> | null | undefined,
  identity?: TicketNotificationIdentity,
): string | null {
  return (
    text(identity?.displayName) ??
    text(identity?.fullName) ??
    text(metadata?.actor_name) ??
    text(identity?.email) ??
    text(metadata?.actor_email) ??
    (text(metadata?.actor_id) ? "Usuário" : null)
  );
}

export function ticketNotificationDisplay(
  event: TicketNotificationEvent,
  metadata: Record<string, unknown> | null | undefined,
  fallbackTitle: string,
  fallbackBody: string | null,
  identity?: TicketNotificationIdentity,
): TicketNotificationDisplay | null {
  const actorName = ticketNotificationActorName(metadata, identity);
  if (!actorName) return null;

  const ticketNumber =
    text(metadata?.ticket_number) ?? fallbackTitle.match(/SUP-\d{4}-\d{6}/i)?.[0] ?? null;
  const subject = fallbackBody ? `Assunto: ${fallbackBody}` : null;
  const action = event === "ticket_created" ? "abriu o ticket" : "respondeu ao ticket";

  return {
    title: `${actorName} ${action}${ticketNumber ? ` ${ticketNumber}` : ""}`,
    body: subject,
    actorName,
  };
}
