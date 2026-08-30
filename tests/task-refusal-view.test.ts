import assert from "node:assert/strict";
import test from "node:test";
import {
  currentTaskRefusal,
  groupTaskRefusals,
  taskRejectionNotificationDetails,
  type TaskRefusalRecord,
} from "../src/lib/task-refusal-view.ts";

const refusal: TaskRefusalRecord = {
  id: "refusal-1",
  company_id: "company-a",
  task_id: "task-1",
  employee_id: "employee-a",
  actor_id: "employee-a",
  reason: "Consulta médica",
  previous_status: "pendente",
  new_status: "cancelado",
  created_at: "2026-08-29T19:41:00.000Z",
};

test("uses persisted history as fallback for an active refusal", () => {
  const details = currentTaskRefusal(
    { status: "cancelado", refused_by: "employee-a", refusal_reason: null, refused_at: null },
    [refusal],
  );

  assert.deepEqual(details, {
    employeeId: "employee-a",
    reason: "Consulta médica",
    refusedAt: "2026-08-29T19:41:00.000Z",
  });
});

test("keeps refusal history after reassignment without mislabelling the current task", () => {
  const history = groupTaskRefusals([refusal]);

  assert.equal(
    currentTaskRefusal({ status: "pendente", refused_by: null }, history.get("task-1") ?? []),
    null,
  );
  assert.equal(history.get("task-1")?.[0]?.reason, "Consulta médica");
});

test("does not classify a manager cancellation as an employee refusal", () => {
  assert.equal(
    taskRejectionNotificationDetails("task_rejected", { rejected_by: "manager-a" }),
    null,
  );
  assert.equal(currentTaskRefusal({ status: "cancelado", refused_by: null }, [refusal]), null);
});

test("reads structured employee refusal metadata from the notification", () => {
  assert.deepEqual(
    taskRejectionNotificationDetails("task_rejected", {
      refused_by: "employee-a",
      employee_name: "Sara",
      refusal_reason: "  Consulta médica  ",
      refused_at: "2026-08-29T19:41:00.000Z",
    }),
    {
      employeeId: "employee-a",
      employeeName: "Sara",
      reason: "Consulta médica",
      refusedAt: "2026-08-29T19:41:00.000Z",
    },
  );
});
