/**
 * OmniBiz · Deteção de tickets duplicados / problemas semelhantes (ADR-048).
 *
 * Toda a deteção acontece no servidor (RPC SECURITY DEFINER `support_find_similar`),
 * que aplica o isolamento multiempresa: tickets da própria empresa vêm com detalhe;
 * tickets de outras empresas vêm apenas como contagem agregada, sem qualquer dado.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "./constants";

export type SimilarityLevel = "strong" | "related";

export interface SimilarTicket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  type: SupportTicketType;
  module: string | null;
  created_at: string;
  resolved_at: string | null;
  level: SimilarityLevel;
  score: number;
  affected_count: number;
}

export interface SimilarResult {
  own: SimilarTicket[];
  others: { count: number; resolved: number };
  signature: { action: string | null; entity: string | null };
}

export async function findSimilarTickets(input: {
  companyId: string;
  type: SupportTicketType;
  title: string;
  description: string;
  module?: string | null;
  route?: string | null;
  limit?: number;
}): Promise<SimilarResult> {
  const { data, error } = await (supabase as any).rpc("support_find_similar", {
    _company_id: input.companyId,
    _type: input.type,
    _title: input.title.trim(),
    _description: input.description.trim(),
    _module: input.module || null,
    _route: input.route || null,
    _limit: input.limit ?? 5,
  });
  if (error) throw error;
  const res = (data ?? {}) as Partial<SimilarResult>;
  return {
    own: (res.own ?? []) as SimilarTicket[],
    others: res.others ?? { count: 0, resolved: 0 },
    signature: res.signature ?? { action: null, entity: null },
  };
}

export interface SameProblemResult {
  ok: boolean;
  visible: boolean;
  affected_count: number;
  ticket_number: string | null;
  ticket_id: string | null;
}

export async function reportSameProblem(
  ticketId: string,
  note?: string | null,
): Promise<SameProblemResult> {
  const { data, error } = await (supabase as any).rpc("support_report_same_problem", {
    _ticket_id: ticketId,
    _note: note ?? null,
  });
  if (error) throw error;
  return data as SameProblemResult;
}

export interface RelatedTicketLink {
  link_id: string;
  relation: "duplicate" | "related";
  direction: "outgoing" | "incoming";
  note: string | null;
  created_at: string;
  ticket: {
    id: string;
    ticket_number: string;
    title: string;
    status: SupportTicketStatus;
    priority: SupportTicketPriority;
    created_at: string;
    same_company: boolean;
  };
}

export interface AffectedEntry {
  id: string;
  created_at: string;
  note: string | null;
  same_company: boolean;
  user_name: string | null;
}

export interface RelatedTicketsResult {
  can_manage: boolean;
  primary_ticket_id: string | null;
  links: RelatedTicketLink[];
  affected: AffectedEntry[];
  affected_count: number;
}

export async function fetchRelatedTickets(ticketId: string): Promise<RelatedTicketsResult> {
  const { data, error } = await (supabase as any).rpc("support_related_tickets", {
    _ticket_id: ticketId,
  });
  if (error) throw error;
  const res = (data ?? {}) as Partial<RelatedTicketsResult>;
  return {
    can_manage: res.can_manage ?? false,
    primary_ticket_id: res.primary_ticket_id ?? null,
    links: res.links ?? [],
    affected: res.affected ?? [],
    affected_count: res.affected_count ?? 0,
  };
}

export async function linkTickets(input: {
  ticketId: string;
  relatedTicketId: string;
  relation: "duplicate" | "related";
  note?: string | null;
}): Promise<string> {
  const { data, error } = await (supabase as any).rpc("support_link_tickets", {
    _ticket_id: input.ticketId,
    _related_ticket_id: input.relatedTicketId,
    _relation: input.relation,
    _note: input.note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function unlinkTickets(linkId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("support_unlink_tickets", { _link_id: linkId });
  if (error) throw error;
}

export interface DuplicateCluster {
  action: string | null;
  entity: string | null;
  tickets_count: number;
  companies_count: number;
  open_count: number;
  last_at: string;
  tickets: {
    id: string;
    ticket_number: string;
    title: string;
    status: SupportTicketStatus;
    priority: SupportTicketPriority;
    company_id: string;
    created_at: string;
  }[];
}

export async function fetchDuplicateClusters(days = 180): Promise<DuplicateCluster[]> {
  const { data, error } = await (supabase as any).rpc("support_duplicate_clusters", { _days: days });
  if (error) throw error;
  return (data ?? []) as DuplicateCluster[];
}

export async function notifyAffected(ticketId: string, message: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc("support_notify_affected", {
    _ticket_id: ticketId,
    _message: message,
  });
  if (error) throw error;
  return (data ?? 0) as number;
}

/** Etiquetas legíveis para a assinatura do problema (ação + entidade). */
export const SIGNATURE_ACTION_LABEL: Record<string, string> = {
  refuse: "Recusar",
  approve: "Aprovar",
  start: "Iniciar",
  complete: "Concluir",
  create: "Criar",
  edit: "Editar",
  delete: "Apagar/Cancelar",
  view: "Visualizar",
  send: "Enviar/Notificar",
  assign: "Atribuir",
  upload: "Anexar/Exportar",
  login: "Acesso/Login",
  save: "Guardar",
  punch: "Picagem",
};

export const SIGNATURE_ENTITY_LABEL: Record<string, string> = {
  task: "Tarefas",
  timesheet: "Folha de ponto",
  vacation: "Férias",
  expense: "Despesas",
  payslip: "Recibos",
  client: "Clientes",
  employee: "Funcionários",
  fleet: "Frota",
  ticket: "Suporte",
  notification: "Notificações",
  navigation: "Navegação",
  geo: "Geolocalização",
  report: "Relatórios",
  auth: "Acessos",
  company: "Empresa",
};

export function signatureLabel(action: string | null, entity: string | null): string {
  const a = action ? (SIGNATURE_ACTION_LABEL[action] ?? action) : null;
  const e = entity ? (SIGNATURE_ENTITY_LABEL[entity] ?? entity) : null;
  if (a && e) return `${e} · ${a}`;
  return e ?? a ?? "Sem assinatura";
}
