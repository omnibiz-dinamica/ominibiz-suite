import { createFileRoute } from "@tanstack/react-router";
import {
  canApproveUserEmailChange,
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

        let decision: "approve" | "reject";
        let decisionReason: string | null;
        let requestId: string;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const requestedDecision = String(body.decision ?? "");
          if (requestedDecision !== "approve" && requestedDecision !== "reject") {
            return json({ error: "Decisão inválida." }, 400);
          }
          decision = requestedDecision;
          decisionReason = String(body.decisionReason ?? "").trim() || null;
          requestId = String(body.requestId ?? "");
        } catch {
          return json({ error: "Pedido inválido." }, 400);
        }

        if (!UUID_PATTERN.test(requestId)) return json({ error: "Decisão inválida." }, 400);
        if (decisionReason && decisionReason.length > 500) {
          return json({ error: "A observação da decisão deve ter até 500 caracteres." }, 400);
        }

        const { data: emailRequest, error: requestError } = await supabaseAdmin
          .from("user_email_change_requests")
          .select("*")
          .eq("id", requestId)
          .maybeSingle();
        if (requestError) return json({ error: "Não foi possível consultar o pedido." }, 500);
        if (!emailRequest) return json({ error: "Pedido não encontrado." }, 404);
        if (emailRequest.status !== "pending") {
          return json({ error: "Este pedido já foi decidido." }, 409);
        }

        const { data: roleRows, error: roleError } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role, company_id")
          .in("user_id", [actor.id, emailRequest.user_id]);
        if (roleError) return json({ error: "Não foi possível validar as permissões." }, 500);

        const roles = (roleRows ?? []) as UserRoleAssignment[];
        if (
          !canApproveUserEmailChange({
            actorId: actor.id,
            companyId: emailRequest.company_id,
            roles,
            targetUserId: emailRequest.user_id,
          })
        ) {
          return json({ error: "Sem permissão para decidir este pedido." }, 403);
        }

        const decisionPatch = {
          decided_at: new Date().toISOString(),
          decided_by: actor.id,
          decision_reason: decisionReason,
          status: decision === "approve" ? "approved" : "rejected",
        };

        if (decision === "reject") {
          const { error: rejectError } = await supabaseAdmin
            .from("user_email_change_requests")
            .update(decisionPatch)
            .eq("id", requestId)
            .eq("status", "pending")
            .select("id")
            .single();
          if (rejectError) return json({ error: "Não foi possível recusar o pedido." }, 500);
          return json({ changed: false, status: "rejected" });
        }

        const { data: targetData, error: targetError } =
          await supabaseAdmin.auth.admin.getUserById(emailRequest.user_id);
        const target = targetData.user;
        if (targetError || !target?.email) return json({ error: "Utilizador não encontrado." }, 404);

        const oldEmail = normalizeUserEmail(target.email);
        const newEmail = normalizeUserEmail(emailRequest.requested_email);
        const auditPayload = {
          action: "email_change",
          actor_id: actor.id,
          company_id: emailRequest.company_id,
          new_email_hash: await sha256(newEmail),
          new_email_redacted: redactUserEmail(newEmail),
          old_email_hash: await sha256(oldEmail),
          old_email_redacted: redactUserEmail(oldEmail),
          status: "pending",
          user_id: emailRequest.user_id,
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

        let changed = false;
        if (oldEmail !== newEmail) {
          const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            emailRequest.user_id,
            { email: newEmail },
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
          changed = true;
        }

        const { error: decisionError } = await supabaseAdmin
          .from("user_email_change_requests")
          .update(decisionPatch)
          .eq("id", requestId)
          .eq("status", "pending")
          .select("id")
          .single();
        if (decisionError) {
          console.error("[user-email] request completion failed", decisionError.message);
          return json({ error: "O e-mail foi atualizado, mas o pedido requer reconciliação administrativa." }, 500);
        }

        const { error: completeAuditError } = await supabaseAdmin
          .from("user_identity_audit")
          .update({ completed_at: new Date().toISOString(), status: "succeeded" })
          .eq("id", audit.id);
        if (completeAuditError) {
          console.error("[user-email] audit completion failed", completeAuditError.message);
        }

        return json({ changed, email: newEmail, status: "approved" });
      },
    },
  },
} as never);
