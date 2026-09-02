import test from "node:test";
import assert from "node:assert/strict";
import {
  customRecurrenceDateRange,
  dateKeyToLocalDate,
  localDateToDateKey,
  normalizeCustomRecurrenceDates,
} from "../src/lib/tasks/custom-recurrence.ts";

test("custom recurrence keeps only the selected dates in date-only order", () => {
  const selected = normalizeCustomRecurrenceDates([
    "2026-09-07",
    "2026-09-01",
    "2026-09-09",
    "2026-09-03",
    "2026-09-05",
    "2026-09-06",
    "2026-09-08",
    "2026-09-03",
  ]);

  assert.deepEqual(selected, [
    "2026-09-01",
    "2026-09-03",
    "2026-09-05",
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
  ]);
  assert.equal(selected.length, 7);
  assert.deepEqual(customRecurrenceDateRange(selected), {
    startDate: "2026-09-01",
    endDate: "2026-09-09",
  });
});

test("custom recurrence rejects invalid dates and preserves the calendar day", () => {
  assert.equal(dateKeyToLocalDate("2026-02-30"), null);
  const date = dateKeyToLocalDate("2026-09-01");
  assert.ok(date);
  assert.equal(localDateToDateKey(date), "2026-09-01");
});
