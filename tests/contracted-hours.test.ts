import assert from "node:assert/strict";
import test from "node:test";
import {
  addWallMinutes,
  calculateWallDurationMinutes,
  distributeContractedMinutes,
  formatContractedMinutes,
  isOvernightTimeRange,
} from "../src/lib/tasks/contracted-hours.ts";

test("distributes contracted minutes exactly among selected employees", () => {
  assert.deepEqual(distributeContractedMinutes(180, 1), [180]);
  assert.deepEqual(distributeContractedMinutes(180, 2), [90, 90]);
  assert.deepEqual(distributeContractedMinutes(180, 3), [60, 60, 60]);
  assert.deepEqual(distributeContractedMinutes(180, 4), [45, 45, 45, 45]);
  assert.deepEqual(distributeContractedMinutes(181, 2), [91, 90]);
  assert.equal(distributeContractedMinutes(181, 2).reduce((sum, value) => sum + value, 0), 181);
});

test("rejects invalid totals and employee counts", () => {
  assert.deepEqual(distributeContractedMinutes(null, 2), []);
  assert.deepEqual(distributeContractedMinutes(0, 2), []);
  assert.deepEqual(distributeContractedMinutes(180, 0), []);
  assert.deepEqual(distributeContractedMinutes(180.5, 2), []);
});

test("adds wall-clock minutes without applying a timezone conversion", () => {
  assert.deepEqual(addWallMinutes("2026-08-31", "15:00", 90), {
    date: "2026-08-31",
    time: "16:30",
  });
  assert.deepEqual(addWallMinutes("2026-08-31", "23:30", 90), {
    date: "2026-09-01",
    time: "01:00",
  });
  assert.equal(addWallMinutes("31/08/2026", "15:00", 90), null);
  assert.equal(addWallMinutes("2026-08-31", "15:00", -1), null);
});

test("calculates overnight fixed schedules on the next wall-clock day", () => {
  assert.equal(calculateWallDurationMinutes("18:30", "01:30"), 420);
  assert.equal(calculateWallDurationMinutes("09:00", "10:00"), 60);
  assert.equal(isOvernightTimeRange("18:30", "01:30"), true);
  assert.equal(isOvernightTimeRange("09:00", "10:00"), false);
  assert.equal(calculateWallDurationMinutes("09:00", "09:00"), null);
  assert.equal(calculateWallDurationMinutes("invalid", "10:00"), null);
});

test("formats contracted minutes for client summaries", () => {
  assert.equal(formatContractedMinutes(180), "3h");
  assert.equal(formatContractedMinutes(105), "1h45");
  assert.equal(formatContractedMinutes(null), "");
});
