import { createFileRoute } from "@tanstack/react-router";
import {
  canManageUserEmail,
  isValidUserEmail,
  normalizeUserEmail,
  redactUserEmail,
  type UserRoleAssignment,
} from "@/lib/user-email-security";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/admin/users/email")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = authHeader.slice("Bearer ".length).trim();
        const {
          data: { user: actor },
          error: authError,
        } = await supabaseAdmin.auth.getUser(token);
        if (authError || !actor) return json({ error: "Sessão inválida." }, 401);

        let companyId: string;
        let email: string;
        let userId: string;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          companyId = String(body.companyId ?? "");
          email = normalizeUserEmail(String(body.email ?? ""));
          userId = String(body.userId ?? "");
        } catch {
          return json({ error: "Pedido inválido." }, 400);
        }

        if (!UUID_PATTERN.test(companyId) || !UUID_PATTERN.test(userId)) {
          return json({ error: "Empresa ou utilizador inválido." }, 400);
        }
        if (!isValidUserEmail(email)) return json({ error: "Informe um e-mail válido." }, 400);

        const { data: roleRows, error: roleError } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role, company_id")
          .in("user_id", [actor.id, userId]);
        if (roleError) return json({ error: "Não foi possível validar as permissões." }, 500);

        const roles = (roleRows ?? []) as UserRoleAssignment[];
        if (!canManageUserEmail({ actorId: actor.id, companyId, roles, targetUserId: userId })) {
          return json({ error: "Sem permissão para alterar o e-mail deste utilizador." }, 403);
        }

        const { data: targetData, error: targetError } =
          await supabaseAdmin.auth.admin.getUserById(userId);
        const target = targetData.user;
        if (targetError || !target?.email)
          return json({ error: "Utilizador não encontrado." }, 404);

        const oldEmail = normalizeUserEmail(target.email);
        if (oldEmail === email) return json({ email, changed: false });

        const auditPayload = {
          action: "email_change",
          actor_id: actor.id,
          company_id: companyId,
          new_email_hash: await sha256(email),
          new_email_redacted: redactUserEmail(email),
          old_email_hash: await sha256(oldEmail),
          old_email_redacted: redactUserEmail(oldEmail),
          status: "pending",
          user_id: userId,
        };
        const { data: audit, error: auditError } = await supabaseAdmin
          .from("user_identity_audit")
          .insert(auditPayload)
          .select("id")
          .single();
        if (auditError || !audit?.id) {
          console.error("[user-email] audit insert failed", auditError?.message);
          return json({ error: "Não foi possível iniciar a alteração auditada." }, 500);
        }

        const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          {
            email,
          },
        );
        if (updateError || !updated.user?.email) {
          await supabaseAdmin
            .from("user_identity_audit")
            .update({ completed_at: new Date().toISOString(), status: "failed" })
            .eq("id", audit.id);
          const duplicate = /already|registered|exists|duplicate/i.test(updateError?.message ?? "");
          return json(
            {
              error: duplicate
                ? "Este e-mail já está associado a outra conta."
                : "Falha ao atualizar o e-mail.",
            },
            duplicate ? 409 : 500,
          );
        }

        const { error: completeAuditError } = await supabaseAdmin
          .from("user_identity_audit")
          .update({ completed_at: new Date().toISOString(), status: "succeeded" })
          .eq("id", audit.id);
        if (completeAuditError) {
          console.error("[user-email] audit completion failed", completeAuditError.message);
        }

        return json({ changed: true, email: normalizeUserEmail(updated.user.email) });
      },
    },
  },
} as never);
