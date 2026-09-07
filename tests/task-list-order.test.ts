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

test("orders task list chronologically from the nearest date to the farthest", () => {
  const result = sortTasksForList(
    [task("far", "2027-06-24"), task("near", "2026-09-08"), task("middle", "2026-09-10")],
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["near", "middle", "far"],
  );
});

test("keeps the source array unchanged and places undated tasks at the end", () => {
  const source = [
    task("far", "2027-06-24"),
    task("near", "2026-09-08"),
    {
      id: "undated",
      scheduled_for: null,
      recurrence_date: null,
      due_at: null,
      created_at: null,
    },
  ];
  const originalOrder = source.map((item) => item.id);

  assert.deepEqual(
    sortTasksForList(source).map((item) => item.id),
    ["near", "far", "undated"],
  );
  assert.deepEqual(
    source.map((item) => item.id),
    originalOrder,
  );
});

test("includes a large employee dataset without losing nearby dates", () => {
  const dates = ["2026-09-08", "2026-09-10", "2027-06-24", "2027-06-25"];
  const result = sortTasksForList(
    Array.from({ length: 132 }, (_, index) => task(`task-${index}`, dates[index % dates.length])),
  );

  assert.deepEqual(result.slice(0, 2).map((item) => item.scheduled_for?.slice(0, 10)), ["2026-09-08", "2026-09-08"]);
  assert.ok(result.findIndex((item) => item.scheduled_for?.startsWith("2027-06-24")) > 1);
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
  assert.deepEqual(result.map((item) => item.id), ["older", "newer"]);
});
