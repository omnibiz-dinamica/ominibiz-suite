import { createFileRoute } from "@tanstack/react-router";
import {
  isValidEmailChangeReason,
  isValidUserEmail,
  normalizeUserEmail,
  redactUserEmail,
} from "@/lib/user-email-security";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export const Route = createFileRoute("/api/users/email-change-requests")({
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
        if (authError || !actor?.email) return json({ error: "Sessão inválida." }, 401);

        let companyId: string;
        let email: string;
        let reason: string;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          companyId = String(body.companyId ?? "");
          email = normalizeUserEmail(String(body.email ?? ""));
          reason = String(body.reason ?? "").trim();
        } catch {
          return json({ error: "Pedido inválido." }, 400);
        }

        if (!UUID_PATTERN.test(companyId)) return json({ error: "Empresa inválida." }, 400);
        if (!isValidUserEmail(email)) return json({ error: "Informe um e-mail válido." }, 400);
        if (!isValidEmailChangeReason(reason)) {
          return json({ error: "Informe um motivo entre 5 e 500 caracteres." }, 400);
        }

        const currentEmail = normalizeUserEmail(actor.email);
        if (currentEmail === email) {
          return json({ error: "O novo e-mail deve ser diferente do e-mail atual." }, 400);
        }

        const { data: actorRoles, error: rolesError } = await supabaseAdmin
          .from("user_roles")
          .select("company_id, role")
          .eq("user_id", actor.id);
        if (rolesError) return json({ error: "Não foi possível validar a conta." }, 500);

        const belongsToCompany = (actorRoles ?? []).some((role) => role.company_id === companyId);
        const isSuperAdmin = (actorRoles ?? []).some((role) => role.role === "super_admin");
        if (!belongsToCompany && !isSuperAdmin) {
          return json({ error: "A conta não pertence à empresa selecionada." }, 403);
        }

        const { data: pending, error: pendingError } = await supabaseAdmin
          .from("user_email_change_requests")
          .select("id")
          .eq("user_id", actor.id)
          .eq("status", "pending")
          .maybeSingle();
        if (pendingError)
          return json({ error: "Não foi possível verificar pedidos pendentes." }, 500);
        if (pending)
          return json({ error: "Já existe um pedido de alteração aguardando decisão." }, 409);

        const { data: created, error: createError } = await supabaseAdmin
          .from("user_email_change_requests")
          .insert({
            company_id: companyId,
            current_email_redacted: redactUserEmail(currentEmail),
            reason,
            requested_email: email,
            user_id: actor.id,
          })
          .select("id, status")
          .single();
        if (createError || !created) {
          const duplicate = createError?.code === "23505";
          return json(
            {
              error: duplicate
                ? "Já existe um pedido aguardando decisão."
                : "Não foi possível enviar o pedido.",
            },
            duplicate ? 409 : 500,
          );
        }

        return json(created, 201);
      },
    },
  },
} as never);
