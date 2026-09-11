import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isDateKeyWithinInclusiveRange } from "../src/lib/tasks/recurrence-date.ts";

const taskForm = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
const clientForm = readFileSync(new URL("../src/routes/app.clientes.tsx", import.meta.url), "utf8");
const clientSchedule = readFileSync(new URL("../src/lib/tasks/client-schedule.ts", import.meta.url), "utf8");
const recurrenceForm = readFileSync(new URL("../src/components/tasks/RecurrenceForm.tsx", import.meta.url), "utf8");
const materialization = readFileSync(
  new URL("../supabase/migrations/20260911120000_sup_2026_000145_preserve_task_groups_in_recurrence_materialization.sql", import.meta.url),
  "utf8",
);

test("flexible client schedules preserve optional time pairs", () => {
  assert.match(clientForm, /start_time: schedule\.startTime \|\| null/);
  assert.match(clientForm, /end_time: schedule\.endTime \|\| null/);
  assert.match(clientForm, /hasStart !== hasEnd/);
  assert.match(clientSchedule, /const startTime = typeof row\.start_time === "string"/);
  assert.match(clientSchedule, /const endTime = typeof row\.end_time === "string"/);
});

test("task modal protects local form state on window focus", () => {
  assert.match(taskForm, /refetchOnWindowFocus: !open && !editing/);
});

test("recurrence start date is inherited from the task date", () => {
  assert.match(taskForm, /current\.frequency === "custom" \|\| current\.startDate === startDate/);
  assert.match(taskForm, /startDateLocked/);
  assert.match(taskForm, /const recurrenceStartDate = recurrence\.enabled/);
  assert.match(recurrenceForm, /disabled=\{uiFrequency === "custom" \|\| startDateLocked\}/);
});

test("business date boundaries are inclusive without timezone conversion", () => {
  assert.equal(isDateKeyWithinInclusiveRange("2027-09-16", "2026-09-10", "2027-09-16"), true);
  assert.equal(isDateKeyWithinInclusiveRange("2027-09-17", "2026-09-10", "2027-09-16"), false);
  assert.equal(isDateKeyWithinInclusiveRange("2027-09-16", "2026-09-10", null), true);
  assert.match(materialization, /explicit_date <= end_date/);
  assert.match(materialization, /end_date >= CURRENT_DATE/);
});

test("employee name search keeps canonical assignment IDs", () => {
  assert.match(taskForm, /id="task-assignee-search"/);
  assert.match(taskForm, /normalize\("NFD"\)/);
  assert.match(taskForm, /assigned_to: memberId/);
  assert.match(taskForm, /queryKey: \["members", currentCompanyId\]/);
});
