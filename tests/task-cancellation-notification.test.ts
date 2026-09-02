import assert from "node:assert/strict";
import test from "node:test";

import { taskCancellationNotificationDetails } from "../src/lib/task-cancellation-notification.ts";

test("cancellation notification exposes actor, task, client and reason", () => {
  assert.deepEqual(
    taskCancellationNotificationDetails("task_cancelled", {
      cancelled_by: "actor-uuid",
      cancelled_by_name: "Joao",
      cancelled_by_role: "Gestor",
      task_title: "Limpeza semanal",
      client_name: "Cliente Ana",
      cancellation_reason: "Cliente cancelou",
      cancelled_at: "2026-09-02T14:15:00.000Z",
    }),
    {
      actorName: "Joao",
      actorRole: "Gestor",
      taskTitle: "Limpeza semanal",
      clientName: "Cliente Ana",
      reason: "Cliente cancelou",
      cancelledAt: "2026-09-02T14:15:00.000Z",
    },
  );
});

test("legacy cancellation notifications keep their existing body fallback", () => {
  assert.equal(taskCancellationNotificationDetails("task_cancelled", {}), null);
  assert.equal(
    taskCancellationNotificationDetails("task_rejected", { cancelled_by_name: "Joao" }),
    null,
  );
});

test("blank actor metadata is not rendered as a fabricated identity", () => {
  assert.equal(
    taskCancellationNotificationDetails("task_cancelled", { cancelled_by_name: "  " }),
    null,
  );
});
