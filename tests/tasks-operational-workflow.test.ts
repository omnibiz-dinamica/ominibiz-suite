import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticAbsenceAllowedAt,
  isBulkArchiveEligible,
  isBulkDeleteEligible,
  isSingleTask,
} from "../src/lib/tasks/operational-rules.ts";

const task = (overrides: Record<string, unknown> = {}) => ({
  status: "concluido",
  archived_at: null,
  recurrence_id: null,
  ...overrides,
});

test("automatic absence is exactly 24 hours after a scheduled start", () => {
  const start = "2026-08-28T09:00:00.000Z";
  assert.equal(automaticAbsenceAllowedAt({ scheduled_for: start })?.toISOString(), "2026-08-29T09:00:00.000Z");
  assert.equal(automaticAbsenceAllowedAt({ scheduled_for: null }), null);
});

test("bulk archive/delete eligibility excludes recurring tasks", () => {
  assert.equal(isSingleTask(task()), true);
  assert.equal(isBulkArchiveEligible(task()), true);
  assert.equal(isBulkDeleteEligible(task({ status: "cancelado" })), true);
  assert.equal(isBulkArchiveEligible(task({ recurrence_id: "series-1" })), false);
  assert.equal(isBulkDeleteEligible(task({ recurrence_id: "series-1", status: "cancelado" })), false);
  assert.equal(isBulkArchiveEligible(task({ status: "pendente" })), false);
  assert.equal(isBulkDeleteEligible(task({ status: "em_andamento" })), false);
});
