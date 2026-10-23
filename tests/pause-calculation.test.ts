import test from "node:test";
import assert from "node:assert/strict";
import { formatPauseList, pauseMinutesNow } from "../src/lib/punch/pause.ts";

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
  assert.equal(pauseMinutesNow({ paused_at: null, resumed_at: null, ended_at: "2026-08-02T14:00:00.000Z" }), null);
});

// Várias pausas por ponto (Eduardo R S Junior, 23/10/2026)
test("adds previous pauses (prior_pause_seconds) to the current pause", () => {
  assert.equal(
    pauseMinutesNow({
      paused_at: "2026-10-23T15:57:25.240Z",
      resumed_at: "2026-10-23T15:57:49.197Z",
      ended_at: "2026-10-23T15:58:29.216Z",
      prior_pause_seconds: 1075,
    }),
    18,
  );
});

test("counts previous pauses even when the current pause was removed", () => {
  assert.equal(
    pauseMinutesNow({
      paused_at: null,
      resumed_at: null,
      ended_at: "2026-08-02T14:00:00.000Z",
      prior_pause_seconds: 600,
    }),
    10,
  );
});

test("keeps single-pause behaviour when prior_pause_seconds is 0 or missing", () => {
  const base = {
    paused_at: "2026-08-02T12:00:00.000Z",
    resumed_at: "2026-08-02T12:17:00.000Z",
    ended_at: "2026-08-02T14:00:00.000Z",
  };
  assert.equal(pauseMinutesNow({ ...base, prior_pause_seconds: 0 }), 17);
  assert.equal(pauseMinutesNow({ ...base, prior_pause_seconds: null }), 17);
});

test("lists all pauses in chronological order", () => {
  const label = formatPauseList(
    [
      { time_entry_id: "e", paused_at: "2026-10-23T15:57:25Z", resumed_at: "2026-10-23T15:57:49Z", is_current: true },
      { time_entry_id: "e", paused_at: "2026-10-23T11:54:18Z", resumed_at: "2026-10-23T12:12:13Z", is_current: false },
    ],
    "Europe/Lisbon",
  );
  assert.equal(label, "12:54–13:12 · 16:57–16:57");
});
