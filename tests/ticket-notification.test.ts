import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ticketNotificationActorName,
  ticketNotificationDisplay,
} from "../src/lib/support/ticket-notification.ts";

test("ticket opening notification identifies the actor and subject", () => {
  const display = ticketNotificationDisplay(
    "ticket_created",
    { actor_id: "sara-id", ticket_number: "SUP-2026-000087" },
    "Novo ticket · SUP-2026-000087",
    "Pedido de recibo",
    { fullName: "Sara" },
  );

  assert.deepEqual(display, {
    title: "Sara abriu o ticket SUP-2026-000087",
    body: "Assunto: Pedido de recibo",
    actorName: "Sara",
  });
});

test("ticket response notification identifies the responding user", () => {
  const display = ticketNotificationDisplay(
    "ticket_message_added",
    { actor_id: "joao-id", ticket_number: "SUP-2026-000087" },
    "Nova mensagem · SUP-2026-000087",
    "Pedido de recibo",
    { displayName: "João" },
  );

  assert.equal(display?.title, "João respondeu ao ticket SUP-2026-000087");
});

test("missing profile name falls back to email and never to UUID", () => {
  assert.equal(
    ticketNotificationActorName({ actor_id: "user-uuid", actor_email: "sara@example.com" }),
    "sara@example.com",
  );
  assert.equal(ticketNotificationActorName({ actor_id: "user-uuid" }), "Usuário");
  assert.doesNotMatch(ticketNotificationActorName({ actor_id: "user-uuid" }) ?? "", /user-uuid/);
});

test("database migration carries actor and message identity without task_id", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260904160000_sup_2026_000087_ticket_actor_notifications.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /'actor_id', v_uid/);
  assert.match(migration, /'actor_email', v_actor_email/);
  assert.match(migration, /'message_id', v_message_id/);
  assert.match(migration, /task_id, event, title, body, priority, metadata/);
  assert.match(migration, /SELECT _company_id, target, NULL, _event/);
  assert.match(migration, /user_id IS DISTINCT FROM auth\.uid\(\)/);
});

test("notification state RPC keeps administrative transitions behind RBAC", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260829190000_sup_2026_000108_notification_actions.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /n\.user_id = _uid/);
  assert.match(migration, /public\.is_company_manager\(_uid, n\.company_id\)/);
  assert.match(migration, /public\.is_super_admin\(_uid\)/);
  assert.match(migration, /_state <> 'arquivada'/);
  assert.match(migration, /revoke update on table public\.notifications from authenticated/);
});
