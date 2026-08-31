import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCreateTicketArgs } from "../src/lib/support/create-ticket-payload.ts";
import { getSupportErrorDetails, getSupportErrorMessage } from "../src/lib/support/errors.ts";

test("builds the canonical RPC payload and normalizes optional fields", () => {
  assert.deepEqual(
    buildCreateTicketArgs({
      companyId: "11111111-1111-4111-8111-111111111111",
      type: "duvida",
      priority: "alta",
      title: "  Testando abertura  ",
      description: "  Testando abertura  ",
      destinationCode: " tech ",
      module: "",
      route: " /app/suporte ",
      pageUrl: "",
    }),
    {
      _company_id: "11111111-1111-4111-8111-111111111111",
      _type: "duvida",
      _priority: "alta",
      _title: "Testando abertura",
      _description: "Testando abertura",
      _module: null,
      _route: "/app/suporte",
      _page_url: null,
      _technical_context: {},
      _destination_code: "tech",
    },
  );
});

test("normalizes a Supabase error object without rendering object Object", () => {
  const error = {
    code: "23503",
    message: 'insert or update on table "notifications" violates foreign key constraint',
    details: "Key (task_id)=(ticket-id) is not present in table tasks.",
    hint: null,
  };

  assert.deepEqual(getSupportErrorDetails(error), error);
  assert.equal(
    getSupportErrorMessage(error),
    "Não foi possível concluir a solicitação devido a uma referência interna inválida.",
  );
  assert.doesNotMatch(getSupportErrorMessage(error), /\[object Object\]/);
});

test("maps known support validation failures to actionable messages", () => {
  assert.equal(
    getSupportErrorMessage({ code: "P0001", message: "destination_required" }),
    "Selecione um destino válido para a solicitação.",
  );
  assert.equal(
    getSupportErrorMessage({ code: "42501", message: "not_authorized" }),
    "Não tem permissão para criar uma solicitação nesta empresa.",
  );
});

test("support notification migration never stores a ticket UUID in task_id", () => {
  const notificationSchema = readFileSync(
    new URL(
      "../supabase/migrations/20260518200213_6aa0efda-cd57-4346-b5fd-ab7be6cdef02.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const incidentMigration = readFileSync(
    new URL(
      "../supabase/migrations/20260828200000_super_admin_operational_notifications.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260830170000_fix_support_ticket_creation_notifications.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(notificationSchema, /task_id UUID REFERENCES public\.tasks\(id\)/);
  assert.match(incidentMigration, /_company_id, target, _ticket_id, _event/);
  assert.match(migration, /_company_id, target, NULL, _event/);
  assert.doesNotMatch(migration, /_company_id, target, _ticket_id, _event/);
  assert.match(migration, /jsonb_build_object\('ticket_id', _ticket_id\)/);
});
