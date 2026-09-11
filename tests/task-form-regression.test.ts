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

test("task views never refetch when the tab or window regains focus", () => {
  assert.match(taskForm, /refetchOnWindowFocus: false/);
  assert.doesNotMatch(taskForm, /refetchOnWindowFocus: !open/);
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

test("task employee lookup uses the canonical profile name projection", () => {
  assert.match(taskForm, /select\("id, full_name, job_title"\)/);
  assert.doesNotMatch(taskForm, /select\("id, full_name, email, job_title"\)/);
  assert.match(taskForm, /taskMemberName\(members, id/);
  assert.doesNotMatch(taskForm, /m\.full_name \?\? m\.id\.slice\(0, 8\)/);
  assert.doesNotMatch(taskForm, /members\.find\(\(m\) => m\.id === id\)\?\.full_name \?\? \(id \? id\.slice\(0, 8\)/);
  assert.match(taskForm, /full_name: taskMemberName\(members \?\? \[\], m\.id, "Funcionário"\)/);
});

test("client select keeps the full list and adds an optional search [12092026-002a]", () => {
  const source = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
  assert.match(source, /placeholder="Buscar cliente\.\.\."/);
  assert.match(source, /const filteredClients = useMemo\(/);
  assert.match(source, /if \(!q\) return clients;/);
  assert.match(source, /c\.id === clientId \|\| tokens\.every/);
  assert.match(source, /filteredClients\.map\(\(c\) => \(/);
});

test("returning to the tab never publishes a new session object [12092026-001c]", () => {
  const auth = readFileSync(new URL("../src/lib/auth.tsx", import.meta.url), "utf8");
  assert.match(auth, /prev\?\.access_token === data\.session!\.access_token \? prev : data\.session/);
});
