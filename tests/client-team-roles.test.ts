import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assignableClientMemberIds,
  clientTeamType,
  habitualClientMembers,
  resourceClientMembers,
} from "../src/lib/tasks/client-team.ts";

const members = [
  { user_id: "habitual-1", assignment_type: "habitual", is_active: true },
  { user_id: "legacy-1", assignment_type: null, is_active: true },
  { user_id: "resource-1", assignment_type: "recurso", is_active: true },
  { user_id: "inactive-1", assignment_type: "habitual", is_active: false },
];

test("legacy and habitual links are the automatic task team; resources are excluded", () => {
  assert.deepEqual(habitualClientMembers(members).map((member) => member.user_id), ["habitual-1", "legacy-1", "inactive-1"]);
  assert.deepEqual(resourceClientMembers(members).map((member) => member.user_id), ["resource-1"]);
  assert.deepEqual(assignableClientMemberIds(members), ["habitual-1", "legacy-1"]);
  assert.equal(clientTeamType({ assignment_type: null }), "habitual");
});

test("team migration keeps old links habitual and filters only defaults", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260910100000_sup_2026_000144_client_team_roles_and_completion_idempotency.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'habitual'/);
  assert.match(migration, /CHECK \(assignment_type IN \('habitual', 'recurso'\)\)/);
  assert.match(migration, /ca\.assignment_type = 'habitual'/);
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.client_default_assignees/);
});

test("completion note reuses the canonical event and avoids recipient duplicates", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260910100000_sup_2026_000144_client_team_roles_and_completion_idempotency.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /TAREFA CONCLUÍDA COM OBSERVAÇÃO/);
  assert.match(migration, /event = 'completion_note'/);
  assert.match(migration, /n\.event = 'task_completed'/);
  assert.match(migration, /n\.user_id = v_mgr\.user_id/);
  assert.match(migration, /IF NOT EXISTS \(/);
  assert.match(migration, /'link', '\/app\/tarefas\?task='/);
});
