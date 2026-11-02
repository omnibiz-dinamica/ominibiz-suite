import { createFileRoute } from "@tanstack/react-router";
import { ModuleGuard } from "@/components/ModuleGuard";
import { RoleGuard } from "@/components/RoleGuard";
import { MessagesPage } from "@/components/messages/MessagesPage";
import { MESSAGES_ALLOWED_ROLES } from "@/lib/messages/permissions";

// Adicional "WhatsApp com IA" (whatsapp_ai): sem o adicional ativo, o ModuleGuard
// bloqueia a URL direta; employee e accountant não têm acesso (RoleGuard).
// A RLS das tabelas msg_* aplica as mesmas regras na base de dados.
export const Route = createFileRoute("/app/assistente")({
  component: () => (
    <ModuleGuard module="whatsapp_ai">
      <RoleGuard allow={MESSAGES_ALLOWED_ROLES}>
        <MessagesPage />
      </RoleGuard>
    </ModuleGuard>
  ),
});
