/**
 * Centraliza o envio de emails de convite (create/resend/replace).
 * Todos os envios ficam registados em `email_send_log` via sendTransactionalEmail.
 */
import { sendTransactionalEmail } from "@/lib/email/send";
import { buildAppUrl } from "@/lib/app-url";

export interface InviteEmailInput {
  inviteId: string;
  token: string;
  email: string;
  role: string;
  companyId: string;
  companyName?: string | null;
  sendCount?: number | null;
  expiresAt?: string | null;
  /** Discriminante para a idempotencyKey (create | resend | replace). */
  kind?: "create" | "resend" | "replace";
}

export async function sendInviteEmail(input: InviteEmailInput) {
  const kind = input.kind ?? "create";
  const count = input.sendCount ?? 1;
  const idempotencyKey =
    kind === "create"
      ? `invite-${input.inviteId}-${count}`
      : `invite-${kind}-${input.inviteId}-${count}`;

  const inviteUrl = buildAppUrl(`/aceitar-convite?token=${input.token}`);

  return sendTransactionalEmail({
    templateName: "invite",
    recipientEmail: input.email,
    idempotencyKey,
    triggerSource: "invite",
    companyId: input.companyId,
    templateData: {
      inviteUrl,
      role: input.role === "manager" ? "Gestor" : input.role === "owner" ? "Proprietário" : "Funcionário",
      companyName: input.companyName ?? undefined,
      expiresAt: input.expiresAt ? new Date(input.expiresAt).toLocaleDateString("pt-PT") : undefined,
    },
  });
}