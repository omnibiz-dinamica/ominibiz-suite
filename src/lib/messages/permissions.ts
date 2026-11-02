import type { AppRole } from "@/lib/auth";

/**
 * Quem usa o módulo Mensagens (adicional whatsapp_ai), com o adicional ativo.
 * Espelha as políticas RLS (msg_can_manage / msg_can_view) — a base de dados
 * continua a ser a camada de segurança; isto só decide o que a tela mostra.
 *
 *  - super_admin, owner, manager: tudo.
 *  - secretary: só vê contatos (sem editar automações nem contatos).
 *  - employee, accountant: não veem o módulo.
 */
export const MESSAGES_ALLOWED_ROLES: AppRole[] = ["super_admin", "owner", "manager", "secretary"];

export interface MessagesAccess {
  canOpen: boolean;
  canManage: boolean;
  canViewContacts: boolean;
}

export function messagesAccess(role: AppRole | null | undefined): MessagesAccess {
  const manage = role === "super_admin" || role === "owner" || role === "manager";
  const secretary = role === "secretary";
  return { canOpen: manage || secretary, canManage: manage, canViewContacts: manage || secretary };
}
