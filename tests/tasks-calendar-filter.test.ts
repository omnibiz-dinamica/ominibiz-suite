import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterCalendarData, tasksForCalendarDay } from "../src/lib/tasks/calendar-filter.ts";

const tasksPage = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");

const tasks = [
  { id: "task-veronica", assigned_to: "veronica" },
  { id: "task-dayane", assigned_to: "dayane" },
];
const vacations = [
  { id: "vacation-veronica", user_id: "veronica" },
  { id: "vacation-keila", user_id: "keila" },
];

test("calendar employee filter keeps only the selected employee in tasks and vacations", () => {
  const result = filterCalendarData(tasks, vacations, "veronica");

  assert.deepEqual(
    result.tasks.map((task) => task.id),
    ["task-veronica"],
  );
  assert.deepEqual(
    result.vacations.map((vacation) => vacation.id),
    ["vacation-veronica"],
  );
});

test("calendar without employee filter keeps all authorized data", () => {
  const result = filterCalendarData(tasks, vacations, undefined);

  assert.equal(result.tasks, tasks);
  assert.equal(result.vacations, vacations);
});

test("calendar multi-employee filter keeps only selected UUIDs", () => {
  const result = filterCalendarData(tasks, vacations, ["veronica", "dayane"]);

  assert.deepEqual(result.tasks.map((task) => task.id), ["task-veronica", "task-dayane"]);
  assert.deepEqual(result.vacations.map((vacation) => vacation.id), ["vacation-veronica"]);
});

test("calendar day uses the same canonical task dates and order as the list", () => {
  const result = tasksForCalendarDay(
    [
      { id: "far", assigned_to: "keila", scheduled_for: "2027-06-24T10:00:00.000Z" },
      { id: "near-late", assigned_to: "keila", scheduled_for: "2026-09-08T12:00:00.000Z" },
      { id: "near-early", assigned_to: "keila", scheduled_for: "2026-09-08T09:00:00.000Z" },
    ],
    "2026-09-08",
  );

  assert.deepEqual(result.map((task) => task.id), ["near-early", "near-late"]);
});

test("task calendar defaults to week while management data stays company-scoped", () => {
  assert.match(tasksPage, /const \[taskView, setTaskView\] = useState<"list" \| "calendar">\("calendar"\)/);
  assert.match(tasksPage, /const \[mode, setMode\] = useState<CalendarMode>\("week"\)/);
  assert.match(tasksPage, /if \(currentCompanyId\) q = q\.eq\("company_id", currentCompanyId\)/);
  assert.match(tasksPage, /if \(!isManager\) q = q\.eq\("assigned_to", user!\.id\)/);
  assert.match(tasksPage, /\.order\("scheduled_for", \{ ascending: true, nullsFirst: false \}\)/);
  assert.doesNotMatch(tasksPage, /TaskListSortSelect|Ordenar lista de tarefas/);
  assert.doesNotMatch(tasksPage, /\.limit\(|\.range\(/);
});
