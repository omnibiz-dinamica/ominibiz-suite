export const SUPPORT_TICKET_CREATED_TEMPLATE = "support_ticket_created";
export const SUPPORT_TICKET_CREATED_EVENT = "ticket_created";

export function supportTicketEmailIdempotencyKey(ticketId: string): string {
  return `support-ticket:${ticketId}:${SUPPORT_TICKET_CREATED_EVENT}`;
}

export type SupportTicketEmailPayload = {
  ticket_number: string;
  company_name: string;
  requester_name: string;
  priority: string;
  status: string;
  title: string;
  ticket_url: string;
};

export function toSupportTicketEmailTemplateData(payload: SupportTicketEmailPayload) {
  return {
    ticketNumber: payload.ticket_number,
    companyName: payload.company_name,
    requesterName: payload.requester_name,
    priority: payload.priority,
    status: payload.status,
    title: payload.title,
    ticketUrl: payload.ticket_url,
  };
}
