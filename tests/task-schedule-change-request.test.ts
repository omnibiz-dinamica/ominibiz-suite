import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260907120000_sup_2026_000143_task_schedule_change_requests.sql",
    import.meta.url,
  ),
  "utf8",
);

test("schedule change is additive, tenant-scoped and occurrence-specific", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS schedule_change_requested_date date/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS schedule_change_needs_reassignment boolean/);
  assert.match(migration, /task_cancel_with_schedule_request/);
  assert.match(migration, /task_transition_with_schedule_request/);
  assert.match(migration, /public\.task_cancel\(_task_id, _reason\)/);
  assert.match(migration, /public\.task_transition\(_task_id, _action, _reason\)/);
  assert.match(migration, /company_id = NEW\.company_id/);
  assert.doesNotMatch(migration, /DROP TABLE public\.tasks/);
  assert.doesNotMatch(migration, /UPDATE public\.tasks\s+SET\s+recurrence_id/);
});

test("repair migration exposes the exact named RPC signature used by the frontend", () => {
  const repairMigration = readFileSync(
    new URL(
      "../supabase/migrations/20260908093000_sup_2026_000143_repair_schedule_cancel_rpc.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(repairMigration, /CREATE OR REPLACE FUNCTION public\.task_cancel_with_schedule_request\(/);
  assert.match(repairMigration, /_task_id uuid[\s\S]*_reason text[\s\S]*_requested_date date[\s\S]*_needs_reassignment boolean/);
  assert.match(repairMigration, /REVOKE ALL ON FUNCTION public\.task_cancel_with_schedule_request\(uuid, text, date, boolean\)/);
  assert.match(repairMigration, /CREATE OR REPLACE FUNCTION public\.tasks_notify_update\(\)/);
  assert.match(repairMigration, /'schedule_change_requested_date', NEW\.schedule_change_requested_date/);
  assert.match(repairMigration, /'schedule_change_needs_reassignment', NEW\.schedule_change_needs_reassignment/);
  assert.match(repairMigration, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(repairMigration, /USING\s*\(\s*true\s*\)/);
  assert.doesNotMatch(repairMigration, /WITH CHECK\s*\(\s*true\s*\)/);
});

test("schedule-change checkbox state is forwarded without coercing true to false", () => {
  const tasksSource = readFileSync(new URL("../src/lib/tasks.ts", import.meta.url), "utf8");
  const dialogSource = readFileSync(new URL("../src/components/tasks/CancelTaskDialog.tsx", import.meta.url), "utf8");
  assert.match(tasksSource, /_needs_reassignment:\s*request\.needsReassignment/);
  assert.match(dialogSource, /checked=\{needsReassignment\}/);
  assert.match(dialogSource, /setNeedsReassignment\(event\.target\.checked\)/);
  assert.match(dialogSource, /Reatribuição:\s*\{needsReassignment \? "sim" : "não"\}/);
});

test("completion notification includes the client while reusing the audit event", () => {
  const completionMigration = readFileSync(
    new URL(
      "../supabase/migrations/20260907130000_sup_2026_000143_completion_note_client.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(completionMigration, /SELECT c\.name INTO v_client/);
  assert.match(completionMigration, /'client_name', v_client/);
  assert.match(completionMigration, /'completion_note', v_note/);
  assert.match(completionMigration, /UPDATE public\.notifications n/);
});
