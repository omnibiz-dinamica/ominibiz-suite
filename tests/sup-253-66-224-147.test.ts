import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  diffGroupAssignees,
  needsGroupAssigneeConfirmation,
  shouldAskGroupScheduleScope,
} from "../src/lib/tasks/group-edit.ts";
import { canOpenNotification, resolveNotificationDestination } from "../src/lib/notification-actions.ts";

const migDir = new URL("../drizzle/migrations/", import.meta.url);
const migration = readdirSync(migDir)
  .filter((f) => f.includes("sup253_sup66_sup224"))
  .map((f) => readFileSync(new URL(f, migDir), "utf8"))
  .join("\n");
const form = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");

test("SUP-253: aviso só quando outra pessoa altera, 1 por salvamento, link /app/ponto", () => {
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'punch_adjusted'/);
  assert.match(migration, /NEW\.changed_by = e\.user_id/);
  assert.match(migration, /AFTER INSERT ON public\.time_entries_audit/);
  assert.match(migration, /'audit_id', NEW\.id/);
  assert.match(migration, /'link', '\/app\/ponto'/);
  assert.match(migration, /SECURITY DEFINER/);
});

test("SUP-66: troca 1↔1 afeta 2 e pede confirmação; adicionar 1 não pede", () => {
  assert.deepEqual(diffGroupAssignees(["a", "b"], ["a", "c"]), {
    added: ["c"], removed: ["b"], affected: 2, changed: true,
  });
  assert.equal(needsGroupAssigneeConfirmation(["a", "b"], ["a", "c"]), true);
  assert.equal(needsGroupAssigneeConfirmation(["a"], ["a", "b"]), false);
  assert.equal(needsGroupAssigneeConfirmation(["a", "b"], ["b", "a"]), false);
});

test("SUP-66: RPC atómica protege quem já iniciou e nunca toca a série", () => {
  assert.match(migration, /FUNCTION public\.task_group_edit_occurrence/);
  assert.match(migration, /já iniciou ou registou ponto/);
  assert.match(migration, /is_company_manager\(v_uid, t\.company_id\)/);
  assert.doesNotMatch(migration, /UPDATE public\.task_recurrences/);
  assert.match(form, /task_group_edit_occurrence/);
  assert.match(form, /\.eq\("task_group_id", initialGroupId\)/);
});

test("SUP-224: pergunta só quando o horário muda e há colegas; sync só pendente/autorizado sem ponto", () => {
  const base = { colleagues: 2, oldStart: "2026-11-02T08:00:00Z", oldEnd: "2026-11-02T12:00:00Z" };
  assert.equal(shouldAskGroupScheduleScope({ ...base, newStart: base.oldStart, newEnd: base.oldEnd }), false);
  assert.equal(shouldAskGroupScheduleScope({ ...base, newStart: "2026-11-02T09:00:00Z", newEnd: base.oldEnd }), true);
  assert.equal(shouldAskGroupScheduleScope({ ...base, colleagues: 0, newStart: "2026-11-02T09:00:00Z", newEnd: base.oldEnd }), false);
  assert.match(migration, /NOT g\.started AND x\.status IN \('pendente','autorizado'\)/);
  assert.match(migration, /'group_schedule_synced'/);
  assert.match(form, /Sim, a todos/);
  assert.match(form, /Só a minha/);
});

test("SUP-147/150: destino derivado do metadata, só interno; sem destino não há Abrir", () => {
  assert.deepEqual(
    resolveNotificationDestination({ event: "task_cancelled", task_id: null, metadata: { task_id: "11111111-1111-1111-1111-111111111111" } }, null),
    { kind: "task", taskId: "11111111-1111-1111-1111-111111111111" },
  );
  assert.equal(canOpenNotification({ event: "task_cancelled", task_id: null, metadata: {} }, null), false);
  assert.equal(canOpenNotification({ event: "task_cancelled", task_id: null, metadata: { link: "https://x.com" } }, null), false);
  assert.deepEqual(resolveNotificationDestination({ event: "punch_adjusted", metadata: { link: "/app/ponto" } }, null), {
    kind: "path", to: "/app/ponto",
  });
});
