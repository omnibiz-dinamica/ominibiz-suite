/**
 * ADR-062 — o funcionário recusa, nunca cancela. O pedido de nova data/hora e a
 * sugestão de responsável são informativos e não alteram a tarefa.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  currentTaskCancellation,
  currentTaskRefusal,
  formatRequestedTime,
} from "../src/lib/task-refusal-view.ts";

const tasksLib = readFileSync(new URL("../src/lib/tasks.ts", import.meta.url), "utf8");
const tasksPage = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
const punchPage = readFileSync(new URL("../src/routes/app.ponto.tsx", import.meta.url), "utf8");
const refuseDialog = readFileSync(
  new URL("../src/components/tasks/RefuseTaskDialog.tsx", import.meta.url),
  "utf8",
);

test("only managers may cancel; the assignee may only refuse", () => {
  assert.match(tasksLib, /export function canCancelTask\([\s\S]{0,220}return ctx\.isManager;/);
  assert.match(tasksLib, /export function canRefuseTask/);
  assert.match(punchPage, /canRefuseTask\(t, \{ userId: currentUserId \}\)/);
  assert.match(punchPage, /Recusar tarefa/);
});

test("soft-deleted tasks never reach the operational lists", () => {
  assert.match(tasksPage, /q = q\.is\("deleted_at", null\)/);
  assert.match(punchPage, /\.is\("deleted_at", null\)/);
});

test("the refusal dialog treats date/time and suggestion as a request only", () => {
  assert.match(refuseDialog, /a tarefa não é movida nem reagendada automaticamente/);
  assert.match(refuseDialog, /Só o gestor pode reatribuir a tarefa/);
  assert.match(refuseDialog, /suggestedEmployeeId:\s*isScheduleChange && needsReassignment/);
  assert.match(refuseDialog, /others = members\.filter\(\(m\) => m\.id !== task\?\.assigned_to\)/);
});

test("requested time and suggested employee are surfaced from the task snapshot", () => {
  assert.deepEqual(
    currentTaskRefusal(
      {
        status: "cancelado",
        assigned_to: "employee-a",
        refused_by: "employee-a",
        schedule_change_requested_date: "2026-09-20",
        schedule_change_requested_time: "14:30:00",
        schedule_change_needs_reassignment: true,
        schedule_change_suggested_employee_id: "employee-b",
      },
      [],
    ),
    {
      employeeId: "employee-a",
      reason: null,
      refusedAt: null,
      requestedDate: "2026-09-20",
      requestedTime: "14:30",
      needsReassignment: true,
      suggestedEmployeeId: "employee-b",
    },
  );

  assert.equal(
    currentTaskCancellation({
      status: "cancelado",
      assigned_to: "employee-a",
      cancelled_by: "manager-a",
      schedule_change_requested_time: "08:00:00",
    })?.requestedTime,
    "08:00",
  );
});

test("blank requested time is never rendered as a fabricated hour", () => {
  assert.equal(formatRequestedTime("  "), null);
  assert.equal(formatRequestedTime(null), null);
});
