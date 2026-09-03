import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticAbsenceAllowedAt,
  isBulkArchiveEligible,
  isBulkDeleteEligible,
  isSingleTask,
  resolveOperationalStatus,
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

test("resolves the same pending, late and absent state for every role", () => {
  const task = { status: "pendente" as const, scheduled_for: "2026-09-02T13:00:00.000Z" };
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 2, 12, 25)), "pendente");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 2, 13, 1)), "atrasada");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 2, 15, 1)), "atrasada");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 3, 12, 59, 59)), "atrasada");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 3, 13, 0)), "ausente");
});

test("keeps overnight timing anchored to the start date", () => {
  const task = { status: "pendente" as const, scheduled_for: "2026-09-02T23:00:00.000Z" };
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 2, 22, 0)), "pendente");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 3, 0, 30)), "atrasada");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 3, 22, 59, 59)), "atrasada");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 3, 23, 0)), "ausente");
});

test("does not apply automatic timing to tasks without a scheduled start", () => {
  assert.equal(resolveOperationalStatus({ status: "pendente", scheduled_for: null }, new Date(2026, 8, 10, 12, 0)), "pendente");
  assert.equal(
    resolveOperationalStatus(
      { status: "pendente", scheduled_for: null, recurrence_date: "2026-09-02", due_at: "2026-09-02T23:59:59.000Z" },
      new Date(2026, 8, 3, 0, 0),
    ),
    "atrasada",
  );
});

test("does not display a premature persisted automatic absence", () => {
  const task = {
    status: "ausente" as const,
    absence_source: "automatica",
    scheduled_for: "2026-09-02T21:30:00.000Z",
  };
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 2, 21, 3)), "pendente");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 3, 21, 29, 59)), "atrasada");
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 3, 21, 30)), "ausente");
});

test("recognizes legacy automatic absence without source or reason", () => {
  const task = {
    status: "ausente" as const,
    scheduled_for: "2026-09-02T21:30:00.000Z",
    absence_source: null,
    absence_reason: null,
  };
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 2, 21, 3)), "pendente");
});

test("recognizes legacy automatic source labels", () => {
  const task = {
    status: "ausente" as const,
    scheduled_for: "2026-09-02T21:30:00.000Z",
    absence_source: "automatico",
  };
  assert.equal(resolveOperationalStatus(task, new Date(2026, 8, 2, 21, 20)), "pendente");
});

test("keeps explicit manual and employee absences terminal", () => {
  const scheduled = "2026-09-02T21:30:00.000Z";
  assert.equal(
    resolveOperationalStatus({ status: "ausente", scheduled_for: scheduled, absence_source: "manual" }, new Date(2026, 8, 2, 21, 20)),
    "ausente",
  );
  assert.equal(
    resolveOperationalStatus({ status: "ausente", scheduled_for: scheduled, absence_source: "employee" }, new Date(2026, 8, 2, 21, 20)),
    "ausente",
  );
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
