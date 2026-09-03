import assert from "node:assert/strict";
import test from "node:test";
import { cyclePositionForDate, scheduleRuleAppliesToDate } from "../src/lib/tasks/client-schedule-rules.ts";

test("keeps a legacy weekly schedule active on its configured weekday", () => {
  const monday = { weekdays: [1] };
  assert.equal(scheduleRuleAppliesToDate(monday, "2026-09-07"), true);
  assert.equal(scheduleRuleAppliesToDate(monday, "2026-09-08"), false);
});

test("supports several schedules for the same client without merging them", () => {
  const schedules = [
    { weekdays: [1], cyclePosition: null },
    { weekdays: [3], cyclePosition: null },
    { weekdays: [5], cyclePosition: null },
  ];
  assert.equal(schedules.filter((s) => scheduleRuleAppliesToDate(s, "2026-09-09")).length, 1);
  assert.deepEqual(schedules.map((s) => s.weekdays[0]), [1, 3, 5]);
});

test("alternates from the explicit anchor rather than ISO calendar weeks", () => {
  const anchor = "2026-09-08";
  assert.equal(cyclePositionForDate(anchor, anchor, 2), 0);
  assert.equal(cyclePositionForDate("2026-09-15", anchor, 2), 1);
  assert.equal(cyclePositionForDate("2026-09-22", anchor, 2), 0);
  assert.equal(cyclePositionForDate("2027-01-12", anchor, 2), 0);
  assert.equal(scheduleRuleAppliesToDate({ weekdays: [2], cycleLengthWeeks: 2, cyclePosition: 1, cycleAnchorDate: anchor }, "2026-09-15"), true);
  assert.equal(scheduleRuleAppliesToDate({ weekdays: [2], cycleLengthWeeks: 2, cyclePosition: 1, cycleAnchorDate: anchor }, "2026-09-22"), false);
});
