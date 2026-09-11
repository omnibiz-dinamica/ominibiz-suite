import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tasksPage = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
const recurrenceDialog = readFileSync(
  new URL("../src/components/tasks/EditRecurrenceDialog.tsx", import.meta.url),
  "utf8",
);
const materialization = readFileSync(
  new URL(
    "../supabase/migrations/20260911120000_sup_2026_000145_preserve_task_groups_in_recurrence_materialization.sql",
    import.meta.url,
  ),
  "utf8",
);

test("task visibility stays company-scoped and employee-scoped by canonical IDs", () => {
  assert.match(tasksPage, /if \(currentCompanyId\) q = q\.eq\("company_id", currentCompanyId\)/);
  assert.match(tasksPage, /if \(!isManager\) q = q\.eq\("assigned_to", user!\.id\)/);
  assert.match(tasksPage, /const inserted = await supabase[\s\S]*\.from\("tasks"\)[\s\S]*assigned_to: memberId/);
  assert.match(tasksPage, /const \{ error: materializeError \} = await \(supabase\.rpc as any\)\("recurrence_materialize"/);
  assert.match(tasksPage, /if \(materializeError\) throw materializeError/);
});

test("single-occurrence recurrence edits preserve wall-clock overnight dates", () => {
  assert.match(recurrenceDialog, /const end = sfIso && safeDuration > 0 \? addWallMinutes\(startDate, startTime, safeDuration\) : null/);
  assert.match(recurrenceDialog, /const seIso = end \? wallDateTimeToISO\(end\.date, end\.time\) : null/);
  assert.doesNotMatch(recurrenceDialog, /new Date\(sfIso\)|sfStart\.getTime\(\)|toISOString\(\)/);
});

test("recurrence materialization preserves the multi-employee task group", () => {
  assert.match(materialization, /recurrence_id, recurrence_date, task_group_id/);
  assert.match(materialization, /v_rec\.id, v_day, v_rec\.task_group_id/);
});
