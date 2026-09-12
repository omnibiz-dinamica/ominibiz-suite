import assert from "node:assert/strict";
import test from "node:test";

import { isDashboardCancelled, isDashboardLateStart, isDashboardOverdue } from "../src/lib/tasks/dashboard-rules.ts";

const scheduled = "2026-09-02T09:00:00.000Z";
const now = new Date("2026-09-02T10:00:00.000Z");

test("dashboard detects a late start and ignores late finish", () => {
  assert.equal(
    isDashboardLateStart({ status: "em_andamento", scheduled_for: scheduled, started_at: "2026-09-02T09:20:00.000Z" }, now),
    true,
  );
  assert.equal(
    isDashboardLateStart({ status: "em_andamento", scheduled_for: scheduled, started_at: "2026-09-02T09:00:00.000Z" }, now),
    false,
  );
});

test("dashboard does not classify a future task or an early start as late", () => {
  assert.equal(
    isDashboardLateStart({ status: "pendente", scheduled_for: "2026-09-02T22:00:00.000Z", started_at: null }, now),
    false,
  );
  assert.equal(
    isDashboardLateStart({ status: "em_andamento", scheduled_for: scheduled, started_at: "2026-09-02T08:59:00.000Z" }, now),
    false,
  );
});

test("dashboard compares scheduled wall-clock time with the device local clock", () => {
  const localNow = new Date(2026, 8, 12, 4, 3, 0);
  assert.equal(
    isDashboardOverdue({ status: "pendente", scheduled_for: "2026-09-12T03:37:00.000Z" }, localNow),
    true,
  );
  assert.equal(
    isDashboardOverdue({ status: "pendente", scheduled_for: "2026-09-12T04:30:00.000Z" }, localNow),
    false,
  );
});

test("dashboard card keeps old active tasks overdue beyond the absence window", () => {
  assert.equal(
    isDashboardOverdue(
      { status: "pendente", scheduled_for: "2026-09-10T03:37:00.000Z" },
      new Date(2026, 8, 12, 4, 3, 0),
    ),
    true,
  );
});

test("no-start tasks are late only during the existing 24-hour window", () => {
  assert.equal(isDashboardLateStart({ status: "pendente", scheduled_for: scheduled, started_at: null }, now), true);
  assert.equal(
    isDashboardLateStart({ status: "pendente", scheduled_for: scheduled, started_at: null }, new Date("2026-09-03T09:00:00.000Z")),
    false,
  );
  assert.equal(isDashboardLateStart({ status: "ausente", scheduled_for: scheduled, started_at: null }, now), false);
});

test("cancelled tasks have their own category and refusals remain separate", () => {
  assert.equal(isDashboardCancelled({ status: "cancelado", refused_by: null }), true);
  assert.equal(isDashboardCancelled({ status: "cancelado", refused_by: "employee-id" }), false);
  assert.equal(isDashboardCancelled({ status: "cancelado", archived_at: "2026-09-02T10:00:00.000Z" }), false);
  assert.equal(
    isDashboardLateStart({ status: "cancelado", scheduled_for: scheduled, started_at: null }, now),
    false,
  );
});
