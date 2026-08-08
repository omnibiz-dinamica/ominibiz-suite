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
  | "fechado"
  | "under_manager_review"
  | "waiting_employee"
  | "resolved_by_manager"
  | "escalated"
  | "under_technical_review"
  | "waiting_manager"
  | "returned_to_manager";

export type SupportLevel = "company" | "technical";
export type SupportOwnerRole = "manager" | "super_admin";
export type SupportCreatedByRole = "employee" | "manager" | "super_admin";

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
  normal: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  alta: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  urgente: "bg-red-500/15 text-red-700 dark:text-red-300",
};

/** Ordem canónica por prioridade (urgente → baixa). */
export const PRIORITY_ORDER: Record<SupportTicketPriority, number> = {
  urgente: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
};

/** Respostas rápidas prontas (Fase 1 — sem edição). */
export const QUICK_REPLIES: { label: string; text: string }[] = [
  { label: "Recebido", text: "Olá! Recebemos a sua solicitação e já iniciámos a análise. Retornaremos em breve com uma atualização." },
  { label: "Em análise", text: "Estamos a analisar o problema reportado. Assim que houver conclusão, entraremos em contacto." },
  { label: "Preciso de mais informação", text: "Para avançarmos, poderia partilhar mais detalhes? (passos para reproduzir, print da tela e horário aproximado do ocorrido)" },
  { label: "Problema identificado", text: "Confirmámos o problema e já foi encaminhado para a equipa técnica. Iremos manter este ticket atualizado." },
  { label: "Correção aplicada", text: "A correção foi aplicada. Por favor, atualize o sistema (Ctrl+F5) e valide se o comportamento está correto." },
  { label: "Atualize o sistema", text: "Por favor, faça um refresh da página (Ctrl+F5) para carregar a versão mais recente e tente novamente." },
  { label: "Encerramento", text: "Como não obtivemos mais retorno, iremos encerrar este ticket. Caso o problema volte a ocorrer, poderá reabrir dentro de 7 dias." },
];

/** Descrições humanas para eventos de auditoria. */
export const EVENT_TYPE_LABEL: Record<string, string> = {
  ticket_created: "Ticket criado",
  message_added: "Mensagem enviada",
  internal_note_added: "Nota interna adicionada",
  status_changed: "Status alterado",
  priority_changed: "Prioridade alterada",
  assignee_changed: "Responsável alterado",
  attachment_added: "Anexo enviado",
  ticket_reopened: "Ticket reaberto",
  employee_ticket_created: "Ticket aberto pelo funcionário",
  manager_ticket_opened: "Ticket aberto pelo gestor",
  manager_requested_information: "Gestor solicitou mais informações",
  manager_resolved_ticket: "Resolvido internamente pelo gestor",
  manager_escalated_ticket: "Encaminhado ao Desenvolvimento",
  super_admin_opened_ticket: "Ticket técnico criado pelo Super Admin",
  super_admin_replied: "Super Admin respondeu",
  super_admin_returned_ticket: "Super Admin devolveu ao Gestor",
  super_admin_started_development: "Super Admin iniciou desenvolvimento",
  super_admin_resolved_ticket: "Super Admin resolveu",
  ticket_closed: "Ticket arquivado",
};

export const TICKET_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aguardando_cliente: "Aguardando cliente",
  em_desenvolvimento: "Em desenvolvimento",
  em_validacao: "Em validação",
  resolvido: "Resolvido",
  rejeitado: "Rejeitado",
  fechado: "Arquivado",
  under_manager_review: "Em análise pelo gestor",
  waiting_employee: "Aguardando funcionário",
  resolved_by_manager: "Resolvido",
  escalated: "Encaminhado ao Desenvolvimento",
  under_technical_review: "Em análise técnica",
  waiting_manager: "Aguardando gestor",
  returned_to_manager: "Devolvido ao gestor",
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
  under_manager_review: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  waiting_employee: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  resolved_by_manager: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  escalated: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  under_technical_review: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  waiting_manager: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  returned_to_manager: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
};

export const TICKET_STATUS_LIST: SupportTicketStatus[] = [
  "aberto",
  "em_analise",
  "under_manager_review",
  "waiting_employee",
  "escalated",
  "under_technical_review",
  "waiting_manager",
  "aguardando_cliente",
  "em_desenvolvimento",
  "em_validacao",
  "resolved_by_manager",
  "returned_to_manager",
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