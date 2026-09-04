import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260904120000_sup_2026_000142_completion_note_notifications.sql",
    import.meta.url,
  ),
  "utf8",
);

test("completion note remains in the audit timeline and is normalized", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.task_add_completion_note/);
  assert.match(migration, /NULLIF\(btrim\(COALESCE\(_note, ''\)\), ''\)/);
  assert.match(migration, /INSERT INTO public\.task_audit_events/);
  assert.match(migration, /event = 'completion_note'/);
  assert.match(migration, /actor_user_id = v_uid/);
  assert.match(migration, /reason = v_note/);
});

test("completion note enriches the task notification without creating a second event", () => {
  assert.match(migration, /UPDATE public\.notifications n/);
  assert.match(migration, /n\.task_id = v_task\.id/);
  assert.match(migration, /n\.event = 'task_completed'/);
  assert.match(migration, /'completion_note', v_note/);
  assert.match(migration, /'completion_note_by', v_uid/);
  assert.match(migration, /'task_id', v_task\.id/);
  assert.match(migration, /FOR v_mgr IN/);
  assert.match(migration, /role IN \('manager', 'owner'\)/);
  assert.match(migration, /PERFORM public\._notify/);
  assert.doesNotMatch(migration, /ALTER TYPE public\.notification_event/);
});

test("retry reuses the audit event and still repairs the notification", () => {
  assert.match(migration, /IF FOUND THEN\s+v_event := v_existing;\s+ELSE/s);
  assert.match(migration, /-- Idempotencia: retries reutilizam o evento e ainda reparam a notificacao\./);
  assert.match(migration, /-- A conclusao ja pode ter criado uma notificacao\. Atualiza-a em vez de duplicar\./);
});
