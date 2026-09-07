import assert from "node:assert/strict";
import test from "node:test";
import { sortTasksForList } from "../src/lib/tasks/list-order.ts";

const task = (id: string, date: string, createdAt = `${date}T08:00:00Z`) => ({
  id,
  scheduled_for: `${date}T10:00:00Z`,
  recurrence_date: null,
  due_at: null,
  created_at: createdAt,
});

test("orders task list with the most recent scheduled task first", () => {
  const result = sortTasksForList(
    [task("old", "2026-07-15"), task("today", "2026-09-06"), task("new", "2026-09-07")],
    "recent",
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["new", "today", "old"],
  );
});

test("supports nearest and oldest task ordering without changing the source array", () => {
  const source = [
    task("old", "2026-09-01"),
    task("today", "2026-09-06"),
    task("future", "2026-09-10"),
  ];
  const originalOrder = source.map((item) => item.id);

  const now = Date.parse("2026-09-06T12:00:00Z");
  assert.deepEqual(
    sortTasksForList(source, "oldest", now).map((item) => item.id),
    ["old", "today", "future"],
  );
  assert.deepEqual(
    sortTasksForList(source, "nearest", now).map((item) => item.id),
    ["today", "future", "old"],
  );
  assert.deepEqual(
    sortTasksForList(source, undefined, now).map((item) => item.id),
    ["today", "future", "old"],
  );
  assert.deepEqual(
    source.map((item) => item.id),
    originalOrder,
  );
});

test("falls back to creation date when a task has no scheduled date", () => {
  const result = sortTasksForList([
    {
      id: "older",
      scheduled_for: null,
      recurrence_date: null,
      due_at: null,
      created_at: "2026-09-01T08:00:00Z",
    },
    {
      id: "newer",
      scheduled_for: null,
      recurrence_date: null,
      due_at: null,
      created_at: "2026-09-06T08:00:00Z",
    },
  ]);
  assert.deepEqual(
    result.map((item) => item.id),
    ["newer", "older"],
  );
});
