import type { SupportTicketPriority, SupportTicketType } from "./constants.ts";

export interface CreateTicketInput {
  companyId: string;
  type: SupportTicketType;
  priority: SupportTicketPriority;
  title: string;
  description: string;
  /** Fila de destino obrigatória (ADR-049): `tech`, `accounting`, `secretary`, … */
  destinationCode: string;
  module?: string | null;
  route?: string | null;
  pageUrl?: string | null;
  technicalContext?: Record<string, unknown>;
}

export function buildCreateTicketArgs(input: CreateTicketInput) {
  return {
    _company_id: input.companyId,
    _type: input.type,
    _priority: input.priority,
    _title: input.title.trim(),
    _description: input.description.trim(),
    _module: input.module?.trim() || null,
    _route: input.route?.trim() || null,
    _page_url: input.pageUrl?.trim() || null,
    _technical_context: input.technicalContext ?? {},
    _destination_code: input.destinationCode.trim(),
  };
}
