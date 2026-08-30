/**
 * OmniBiz · Worker de disparo das notificações WhatsApp de tickets.
 *
 * Consome o outbox `public.whatsapp_notifications` e faz POST no webhook do
 * ActivePieces. A URL do webhook é um secret de servidor
 * (`ACTIVEPIECES_WEBHOOK_URL`) e nunca chega ao browser.
 *
 * Máquina de estados: pending -> sending -> sent | (retry) pending | failed.
 * Registos `skipped` nunca são reclamados (não têm destinatário único).
 *
 * Segurança: prefixo /api/public/* ignora a autenticação do site publicado,
 * por isso o handler valida o header `apikey` contra a chave publicável.
 */
import { createFileRoute } from "@tanstack/react-router";

const REQUEST_TIMEOUT_MS = 10_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/whatsapp/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const providedKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

        if (!expectedKey || providedKey !== expectedKey) {
          return json({ error: "Unauthorized" }, 401);
        }

        const webhookUrl = process.env.ACTIVEPIECES_WEBHOOK_URL;
        if (!webhookUrl) {
          return json({ error: "ACTIVEPIECES_WEBHOOK_URL não configurado" }, 500);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: batch, error: claimError } = await supabaseAdmin.rpc("whatsapp_claim_batch", {
          _limit: 10,
        });
        if (claimError) {
          console.error("[whatsapp-dispatch] claim failed", claimError.message);
          return json({ error: claimError.message }, 500);
        }

        const rows = (batch ?? []) as Array<{
          id: string;
          event: string;
          ticket_id: string | null;
          company_id: string | null;
          recipient_user_id: string | null;
          recipient_phone: string | null;
          payload: Record<string, unknown>;
          attempts: number;
        }>;

        let sent = 0;
        let failed = 0;

        for (const row of rows) {
          const body = {
            notification_id: row.id,
            event: row.event,
            ticket_id: row.ticket_id,
            company_id: row.company_id,
            recipient_user_id: row.recipient_user_id,
            recipient_phone: row.recipient_phone,
            attempt: row.attempts,
            payload: row.payload,
          };

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

          try {
            const res = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            const text = (await res.text().catch(() => "")).slice(0, 2000);

            if (res.ok) {
              sent += 1;
              console.log(
                `[whatsapp-dispatch] sent id=${row.id} event=${row.event} http=${res.status}`,
              );
              await supabaseAdmin.rpc("whatsapp_mark_sent", {
                _id: row.id,
                _http_status: res.status,
                _response: text,
              });
            } else {
              failed += 1;
              console.error(
                `[whatsapp-dispatch] failed id=${row.id} event=${row.event} http=${res.status}`,
              );
              await supabaseAdmin.rpc("whatsapp_mark_failed", {
                _id: row.id,
                _error: `HTTP ${res.status}`,
                _http_status: res.status,
                _response: text,
              });
            }
          } catch (err) {
            failed += 1;
            const message =
              (err as Error)?.name === "AbortError"
                ? `Timeout após ${REQUEST_TIMEOUT_MS} ms`
                : ((err as Error)?.message ?? "Erro de rede");
            console.error(`[whatsapp-dispatch] error id=${row.id} ${message}`);
            await supabaseAdmin.rpc("whatsapp_mark_failed", {
              _id: row.id,
              _error: message,
            });
          } finally {
            clearTimeout(timer);
          }
        }

        return json({ claimed: rows.length, sent, failed });
      },
    },
  },
} as never);
