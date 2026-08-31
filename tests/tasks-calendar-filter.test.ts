import assert from "node:assert/strict";
import test from "node:test";
import { filterCalendarData } from "../src/lib/tasks/calendar-filter.ts";

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
