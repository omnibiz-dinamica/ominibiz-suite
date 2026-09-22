/**
 * Etapa A (SUP · encerramento de tickets) — espelho no frontend da regra
 * canónica public.support_can_close_ticket. O backend é sempre a autoridade;
 * isto serve apenas para esconder o botão de quem não pode encerrar.
 */
import { ARCHIVABLE_STATUSES, AWAITING_VALIDATION_STATUSES } from "./constants";

export const TECHNICAL_DESTINATION_CODES = ["tech"];

export type TicketCloseContext = {
  isSuperAdmin: boolean;
  /** Tem papel manager/owner na empresa DO TICKET (não na empresa activa). */
  isCompanyManager: boolean;
  /** É o solicitante do ticket. */
  isRequester: boolean;
  destinationCode: string | null;
  status: string;
};

export function isTechnicalDestination(code: string | null): boolean {
  return TECHNICAL_DESTINATION_CODES.includes(code ?? "");
}

/** Quem pode encerrar, independentemente do estado do ticket. */
export function canCloseTicketByRole(ctx: TicketCloseContext): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.isRequester) return true;
  if (isTechnicalDestination(ctx.destinationCode)) return false;
  return ctx.isCompanyManager;
}

/** Regra completa: papel + estado (o super_admin encerra em qualquer estado). */
export function canCloseTicketNow(ctx: TicketCloseContext): boolean {
  if (!canCloseTicketByRole(ctx)) return false;
  if (ctx.status === "fechado") return false;
  if (ctx.isSuperAdmin) return true;
  return (
    ARCHIVABLE_STATUSES.includes(ctx.status) || AWAITING_VALIDATION_STATUSES.includes(ctx.status)
  );
}

/**
 * Parte 3B — arquivar é só visibilidade (archived_at/archived_by) e nunca
 * altera o status. Permissão espelha public.support_can_close_ticket.
 */
export function canArchiveTicketNow(
  ctx: TicketCloseContext & { archivedAt: string | null },
): boolean {
  if (ctx.archivedAt) return false;
  if (!canCloseTicketByRole(ctx)) return false;
  if (ctx.isSuperAdmin) return true;
  return (
    ARCHIVABLE_STATUSES.includes(ctx.status) ||
    AWAITING_VALIDATION_STATUSES.includes(ctx.status) ||
    ctx.status === "fechado"
  );
}

/**
 * Parte 3A — assumir o ticket (responsável + claim da notificação numa só
 * operação). Espelha public.support_can_serve_ticket: o solicitante não
 * assume, e as filas técnicas continuam reservadas ao super_admin.
 */
export function canClaimTicket(ctx: {
  isSuperAdmin: boolean;
  isCompanyManager: boolean;
  destinationCode: string | null;
  assignedUserId: string | null;
  currentUserId: string | null;
}): boolean {
  if (ctx.assignedUserId) return false;
  if (ctx.isSuperAdmin) return true;
  if (isTechnicalDestination(ctx.destinationCode)) return false;
  return ctx.isCompanyManager && !!ctx.currentUserId;
}
