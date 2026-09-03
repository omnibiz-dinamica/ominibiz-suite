import assert from "node:assert/strict";
import test from "node:test";

import { formatStartedLateMinutes, startedLateMinutes } from "../src/lib/tasks/operational-rules.ts";

const localISO = (hour: number, minute: number) => new Date(2026, 8, 2, hour, minute).toISOString();

test("derives late-start minutes from the start, never from the finish", () => {
  assert.equal(
    startedLateMinutes({ scheduled_for: "2026-09-02T22:00:00.000Z", started_at: localISO(22, 42) }),
    42,
  );
  assert.equal(
    startedLateMinutes({ scheduled_for: "2026-09-02T22:00:00.000Z", started_at: localISO(22, 0) }),
    null,
  );
  assert.equal(
    startedLateMinutes({ scheduled_for: "2026-09-02T22:00:00.000Z", started_at: localISO(21, 55) }),
    null,
  );
});

test("preserves overnight scheduled starts and formats useful delay labels", () => {
  assert.equal(
    startedLateMinutes({ scheduled_for: "2026-09-02T22:00:00.000Z", started_at: localISO(23, 15) }),
    75,
  );
  assert.equal(formatStartedLateMinutes(42), "42 min");
  assert.equal(formatStartedLateMinutes(75), "1h 15min");
  assert.equal(formatStartedLateMinutes(120), "2h");
});

test("does not invent a delay when one of the timestamps is missing or invalid", () => {
  assert.equal(startedLateMinutes({ scheduled_for: null, started_at: localISO(22, 42) }), null);
  assert.equal(startedLateMinutes({ scheduled_for: "invalid", started_at: localISO(22, 42) }), null);
  assert.equal(startedLateMinutes({ scheduled_for: "2026-09-02T22:00:00.000Z", started_at: null }), null);
});
