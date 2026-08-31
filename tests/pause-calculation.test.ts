import test from "node:test";
import assert from "node:assert/strict";
import { pauseMinutesNow } from "../src/lib/punch/pause.ts";

test("calculates a completed pause in minutes", () => {
  assert.equal(
    pauseMinutesNow({
      paused_at: "2026-08-02T12:00:00.000Z",
      resumed_at: "2026-08-02T12:17:00.000Z",
      ended_at: "2026-08-02T14:00:00.000Z",
    }),
    17,
  );
});

test("returns null when the time entry has no pause", () => {
  assert.equal(
    pauseMinutesNow({ paused_at: null, resumed_at: null, ended_at: "2026-08-02T14:00:00.000Z" }),
    null,
  );
});
