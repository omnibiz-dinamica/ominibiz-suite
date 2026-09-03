import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260902193000_sup_2026_000138_late_start_notifications.sql", import.meta.url),
  "utf8",
);

test("late task start notification compares wall-clock values and targets both audiences", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.tasks_notify_late_start/);
  assert.match(migration, /NEW\.status IS DISTINCT FROM OLD\.status/);
  assert.match(migration, /NEW\.status = 'em_andamento'/);
  assert.match(migration, /NEW\.started_at AT TIME ZONE COALESCE\(v_timezone, 'UTC'\)/);
  assert.match(migration, /v_scheduled_wall := NEW\.scheduled_for AT TIME ZONE 'UTC'/);
  assert.match(migration, /v_started_wall > v_scheduled_wall/);
  assert.match(migration, /v_title := 'Tarefa iniciada em atraso'/);
  assert.match(migration, /'delay_minutes', v_delay_minutes/);
  assert.match(migration, /SELECT NEW\.assigned_to AS user_id/);
  assert.match(migration, /ur\.role IN \('manager', 'owner', 'super_admin'\)/);
  assert.match(migration, /PERFORM public\._notify/);
  assert.match(migration, /'task_started'/);
  assert.match(migration, /n\.event = 'task_started'/);
});

test("late task start keeps the existing notification event and trigger contract", () => {
  assert.match(migration, /CREATE TRIGGER trg_tasks_notify_late_start/);
  assert.match(migration, /AFTER UPDATE ON public\.tasks/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.tasks_notify_late_start\(\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.tasks_notify_late_start\(\) TO authenticated/);
  assert.doesNotMatch(migration, /ALTER TYPE public\.notification_event/);
});
