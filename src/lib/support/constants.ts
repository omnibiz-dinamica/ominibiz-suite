/**
 * OmniBiz · Módulo Central de Suporte — constantes UI compartilhadas.
 * Ver docs/ARCHITECTURE_SUPPORT_TICKETS.md
 */

export type SupportTicketType =
  | "erro"
  | "alteracao"
  | "inclusao"
  | "duvida"
  | "acesso"
  | "financeiro"
  | "rh"
  | "tarefas"
  | "ponto"
  | "ferias"
  | "despesas"
  | "recibos"
  | "clientes"
  | "geolocalizacao"
  | "outro";

export type SupportTicketPriority = "baixa" | "normal" | "alta" | "urgente";

export type SupportTicketStatus =
  | "aberto"
  | "em_analise"
  | "aguardando_cliente"
  | "em_desenvolvimento"
  | "em_validacao"
  | "resolvido"
  | "rejeitado"
  | "fechado";

export const TICKET_TYPE_LABEL: Record<SupportTicketType, string> = {
  erro: "Erro",
  alteracao: "Pedido de alteração",
  inclusao: "Inclusão de funcionalidade",
  duvida: "Dúvida",
  acesso: "Problema de acesso",
  financeiro: "Financeiro",
  rh: "RH / Funcionário",
  tarefas: "Tarefas",
  ponto: "Folha de ponto",
  ferias: "Férias",
  despesas: "Despesas",
  recibos: "Recibos",
  clientes: "Clientes",
  geolocalizacao: "Geolocalização",
  outro: "Outro",
};

export const TICKET_PRIORITY_LABEL: Record<SupportTicketPriority, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const TICKET_PRIORITY_TONE: Record<SupportTicketPriority, string> = {
  baixa: "bg-muted text-muted-foreground",
  normal: "bg-secondary text-secondary-foreground",
  alta: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgente: "bg-destructive/15 text-destructive",
};

export const TICKET_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aguardando_cliente: "Aguardando cliente",
  em_desenvolvimento: "Em desenvolvimento",
  em_validacao: "Em validação",
  resolvido: "Resolvido",
  rejeitado: "Rejeitado",
  fechado: "Fechado",
};

export const TICKET_STATUS_TONE: Record<SupportTicketStatus, string> = {
  aberto: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  em_analise: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  aguardando_cliente: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  em_desenvolvimento: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  em_validacao: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  resolvido: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejeitado: "bg-destructive/15 text-destructive",
  fechado: "bg-muted text-muted-foreground",
};

export const TICKET_STATUS_LIST: SupportTicketStatus[] = [
  "aberto",
  "em_analise",
  "aguardando_cliente",
  "em_desenvolvimento",
  "em_validacao",
  "resolvido",
  "rejeitado",
  "fechado",
];

export const TICKET_TYPE_LIST: SupportTicketType[] = [
  "erro",
  "alteracao",
  "inclusao",
  "duvida",
  "acesso",
  "financeiro",
  "rh",
  "tarefas",
  "ponto",
  "ferias",
  "despesas",
  "recibos",
  "clientes",
  "geolocalizacao",
  "outro",
];

export const TICKET_PRIORITY_LIST: SupportTicketPriority[] = [
  "baixa",
  "normal",
  "alta",
  "urgente",
];

/**
 * MIME types accepted for anexos. Vídeo intencionalmente excluído (Fase 1).
 */
export const ALLOWED_ATTACHMENT_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const SUPPORT_BUCKET = "support-ticket-attachments";

export const REOPEN_WINDOW_DAYS = 7;

export function ticketReopenableByManager(closedAtIso: string | null): boolean {
  if (!closedAtIso) return false;
  const closed = new Date(closedAtIso).getTime();
  return Date.now() - closed <= REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}