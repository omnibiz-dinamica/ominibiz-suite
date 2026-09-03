import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import {
  SUPPORT_TICKET_CREATED_TEMPLATE,
  supportTicketEmailIdempotencyKey,
  toSupportTicketEmailTemplateData,
  type SupportTicketEmailPayload,
} from "@/lib/support/ticket-email";

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  return local && domain ? `${local.slice(0, 1)}***@${domain}` : "***";
}

export const Route = createFileRoute("/api/support/ticket-created-email")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
          console.error("[support-ticket-email] missing server configuration");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const admin = createClient(supabaseUrl, serviceRoleKey);
        const token = authHeader.slice("Bearer ".length).trim();
        const {
          data: { user },
          error: authError,
        } = await admin.auth.getUser(token);
        if (authError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let ticketId = "";
        try {
          const body = await request.json();
          ticketId = typeof body?.ticketId === "string" ? body.ticketId.trim() : "";
        } catch {
          return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
        }
        if (!ticketId) return Response.json({ error: "ticketId is required" }, { status: 400 });

        const { data: ticket, error: ticketError } = await admin
          .from("support_tickets")
          .select("id, ticket_number, company_id, requester_user_id")
          .eq("id", ticketId)
          .maybeSingle();
        if (ticketError) {
          console.error("[support-ticket-email] ticket lookup failed", ticketError);
          return Response.json({ error: "Ticket lookup failed" }, { status: 500 });
        }
        if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });

        const { data: superAdminRole } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("role", "super_admin")
          .limit(1)
          .maybeSingle();
        if (ticket.requester_user_id !== user.id && !superAdminRole) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data: outbox, error: outboxError } = await (admin as any)
          .from("support_ticket_email_outbox")
          .select("id, company_id, recipient_email, payload, status")
          .eq("ticket_id", ticketId)
          .eq("event_type", "ticket_created")
          .maybeSingle();
        if (outboxError) {
          console.error("[support-ticket-email] outbox lookup failed", outboxError);
          return Response.json({ error: "Email outbox unavailable" }, { status: 500 });
        }
        if (!outbox) return Response.json({ success: false, reason: "email_disabled" });
        if (outbox.status !== "pending") {
          return Response.json({ success: true, reason: "already_processed" });
        }

        const { data: claimed, error: claimError } = await (admin as any)
          .from("support_ticket_email_outbox")
          .update({ status: "sending", attempts: 1 })
          .eq("id", outbox.id)
          .eq("status", "pending")
          .select("id, company_id, recipient_email, payload")
          .maybeSingle();
        if (claimError) {
          console.error("[support-ticket-email] claim failed", claimError);
          return Response.json({ error: "Email outbox claim failed" }, { status: 500 });
        }
        if (!claimed) return Response.json({ success: true, reason: "already_processing" });

        const idempotencyKey = supportTicketEmailIdempotencyKey(ticketId);
        const recipient = String(claimed.recipient_email);
        const payload = claimed.payload as SupportTicketEmailPayload;
        const logSend = async (status: string, errorMessage?: string) => {
          const { error } = await admin.from("email_send_log").insert({
            company_id: claimed.company_id,
            recipient_email: recipient,
            template_name: SUPPORT_TICKET_CREATED_TEMPLATE,
            status,
            trigger_source: "support_ticket_created",
            metadata: { ticket_id: ticketId, event: "ticket_created", idempotency_key: idempotencyKey },
            ...(errorMessage ? { error_message: errorMessage } : {}),
          });
          if (error) console.error("[support-ticket-email] email_send_log insert failed", error);
        };

        try {
          const result = await sendTemplateEmail(
            SUPPORT_TICKET_CREATED_TEMPLATE,
            recipient,
            {
              templateData: toSupportTicketEmailTemplateData(payload),
              idempotencyKey,
            },
          );
          const status = result.sent ? "sent" : "suppressed";
          await (admin as any)
            .from("support_ticket_email_outbox")
            .update({ status, sent_at: result.sent ? new Date().toISOString() : null, last_error: null })
            .eq("id", claimed.id);
          await logSend(status);
          console.log("[support-ticket-email] processed", {
            ticketId,
            status,
            recipient: redactEmail(recipient),
          });
          return Response.json({ success: result.sent, reason: result.sent ? undefined : "email_suppressed" });
        } catch (error: any) {
          const message = error?.message ? String(error.message).slice(0, 400) : "Unknown send error";
          await (admin as any)
            .from("support_ticket_email_outbox")
            .update({ status: "failed", last_error: message })
            .eq("id", claimed.id);
          await logSend("failed", message);
          console.error("[support-ticket-email] delivery failed", {
            ticketId,
            recipient: redactEmail(recipient),
            code: error?.code,
            message,
          });
          return Response.json({ error: "Failed to send email" }, { status: 500 });
        }
      },
    },
  },
} as any);
