/**
 * Envio de emails da aplicação (managed delivery).
 *
 * Substitui a antiga rota /lovable/email/transactional/send: já não existe fila,
 * token de unsubscribe nem verificação local de supressão — a entrega, retries,
 * supressão e unsubscribe são geridos pela infraestrutura de email da Lovable.
 *
 * Mantém-se a auditoria em `email_send_log` (status: sent | suppressed | failed).
 */
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

function redactEmail(email: string | null | undefined): string {
  if (!email) return "***";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  return `${localPart[0]}***@${domain}`;
}

export const Route = createFileRoute("/api/email/send")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
          console.error("Missing required environment variables");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.slice("Bearer ".length).trim();
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser(token);

        if (authError || !user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let templateName: string;
        let recipientEmail: string;
        let idempotencyKey: string;
        let templateData: Record<string, any> = {};
        try {
          const body = await request.json();
          templateName = body.templateName || body.template_name;
          recipientEmail = body.recipientEmail || body.recipient_email;
          idempotencyKey = body.idempotencyKey || body.idempotency_key || crypto.randomUUID();
          if (body.templateData && typeof body.templateData === "object") {
            templateData = body.templateData;
          }
        } catch {
          return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
        }

        if (!templateName) {
          return Response.json({ error: "templateName is required" }, { status: 400 });
        }

        const template = TEMPLATES[templateName];
        if (!template) {
          console.error("Template not found in registry", { templateName });
          return Response.json(
            {
              error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(", ")}`,
            },
            { status: 404 },
          );
        }

        const effectiveRecipient = template.to || recipientEmail;
        if (!effectiveRecipient) {
          return Response.json(
            {
              error: "recipientEmail is required (unless the template defines a fixed recipient)",
            },
            { status: 400 },
          );
        }

        async function logSend(status: string, errorMessage?: string) {
          const { error } = await supabase.from("email_send_log").insert({
            template_name: templateName,
            recipient_email: effectiveRecipient,
            status,
            ...(errorMessage ? { error_message: errorMessage } : {}),
          });
          if (error) {
            console.error("Failed to write email_send_log", { error, status, templateName });
          }
        }

        try {
          const result = await sendTemplateEmail(templateName, effectiveRecipient, {
            templateData,
            idempotencyKey,
          });

          if (!result.sent) {
            await logSend("suppressed");
            console.log("Email suppressed", {
              templateName,
              recipient_redacted: redactEmail(effectiveRecipient),
            });
            return Response.json({ success: false, reason: "email_suppressed" });
          }

          await logSend("sent");
          console.log("Email sent", {
            templateName,
            recipient_redacted: redactEmail(effectiveRecipient),
          });
          return Response.json({ success: true });
        } catch (error: any) {
          const message = error?.message ? String(error.message).slice(0, 400) : "Unknown send error";
          await logSend("failed", message);
          console.error("Failed to send email", {
            templateName,
            recipient_redacted: redactEmail(effectiveRecipient),
            code: error?.code,
            message,
          });
          return Response.json({ error: "Failed to send email" }, { status: 500 });
        }
      },
    },
  },
} as any);
