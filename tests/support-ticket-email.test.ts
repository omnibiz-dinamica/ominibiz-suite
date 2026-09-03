import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SUPPORT_TICKET_CREATED_EVENT,
  SUPPORT_TICKET_CREATED_TEMPLATE,
  supportTicketEmailIdempotencyKey,
  toSupportTicketEmailTemplateData,
} from "../src/lib/support/ticket-email.ts";

test("ticket-created email has one stable idempotency key", () => {
  const ticketId = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    supportTicketEmailIdempotencyKey(ticketId),
    `support-ticket:${ticketId}:${SUPPORT_TICKET_CREATED_EVENT}`,
  );
  assert.equal(supportTicketEmailIdempotencyKey(ticketId), supportTicketEmailIdempotencyKey(ticketId));
  assert.equal(SUPPORT_TICKET_CREATED_TEMPLATE, "support_ticket_created");
});

test("maps only the safe ticket summary into the email template", () => {
  assert.deepEqual(
    toSupportTicketEmailTemplateData({
      ticket_number: "SUP-2026-000139",
      company_name: "Empresa Teste",
      requester_name: "Eduardo Teste",
      priority: "alta",
      status: "aberto",
      title: "Falha no ponto",
      ticket_url: "https://ominibiz-suite.lovable.app/app/suporte/ticket-id",
    }),
    {
      ticketNumber: "SUP-2026-000139",
      companyName: "Empresa Teste",
      requesterName: "Eduardo Teste",
      priority: "alta",
      status: "aberto",
      title: "Falha no ponto",
      ticketUrl: "https://ominibiz-suite.lovable.app/app/suporte/ticket-id",
    },
  );
});

test("database outbox is insert-only for ticket creation and idempotent per ticket", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260902190000_sup_2026_000139_support_ticket_email.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /AFTER INSERT ON public\.support_tickets/);
  assert.doesNotMatch(migration, /AFTER INSERT OR UPDATE ON public\.support_tickets/);
  assert.match(migration, /UNIQUE \(ticket_id, event_type\)/);
  assert.match(migration, /support_email_notifications_enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration, /support_notification_email text/);
  assert.match(migration, /status IN \('pending', 'sending', 'sent', 'suppressed', 'failed'\)/);
});
