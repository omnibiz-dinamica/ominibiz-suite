import { supabase } from "@/integrations/supabase/client";

/** Dispatches the durable ticket-created outbox without blocking ticket creation. */
export async function dispatchTicketCreatedEmail(ticketId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.error("[support-ticket-email] no authenticated session for dispatch", { ticketId });
    return;
  }

  const response = await fetch("/api/support/ticket-created-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ticketId }),
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }
    console.error("[support-ticket-email] dispatch failed", { ticketId, status: response.status, body });
  }
}
