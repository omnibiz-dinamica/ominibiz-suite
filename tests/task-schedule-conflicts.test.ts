import test from "node:test";
import assert from "node:assert/strict";
import { intervalsOverlap, overlapInterval } from "../src/lib/tasks/schedule-conflicts.ts";

const iso = (day: string, time: string) => `${day}T${time}:00.000Z`;

test("detects partial, contained, containing and identical intervals", () => {
  assert.equal(
    intervalsOverlap(
      iso("2026-09-02", "11:00"),
      iso("2026-09-02", "13:00"),
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "12:00"),
    ),
    true,
  );
  assert.equal(
    intervalsOverlap(
      iso("2026-09-02", "11:00"),
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "14:00"),
    ),
    true,
  );
  assert.equal(
    intervalsOverlap(
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "14:00"),
      iso("2026-09-02", "11:00"),
      iso("2026-09-02", "12:00"),
    ),
    true,
  );
  assert.equal(
    intervalsOverlap(
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "12:00"),
    ),
    true,
  );
});

test("does not treat adjacent intervals as overlap", () => {
  assert.equal(
    intervalsOverlap(
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "14:00"),
    ),
    false,
  );
  assert.equal(
    overlapInterval(
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "14:00"),
    ),
    null,
  );
});

test("detects overnight overlap using complete timestamps", () => {
  const result = overlapInterval(
    iso("2026-09-03", "00:30"),
    iso("2026-09-03", "02:00"),
    iso("2026-09-02", "22:00"),
    iso("2026-09-03", "01:30"),
  );
  assert.deepEqual(result, { start: iso("2026-09-03", "00:30"), end: iso("2026-09-03", "01:30") });
  assert.equal(
    intervalsOverlap(
      iso("2026-09-03", "02:00"),
      iso("2026-09-03", "04:00"),
      iso("2026-09-02", "22:00"),
      iso("2026-09-03", "01:30"),
    ),
    false,
  );
});

test("rejects malformed or non-positive intervals without a false alert", () => {
  assert.equal(
    intervalsOverlap(
      "bad",
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "14:00"),
    ),
    false,
  );
  assert.equal(
    intervalsOverlap(
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "12:00"),
      iso("2026-09-02", "10:00"),
      iso("2026-09-02", "14:00"),
    ),
    false,
  );
});
