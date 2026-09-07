import assert from "node:assert/strict";
import test from "node:test";
import { formatCivilDate, resolveTaskOperationalNotes } from "../src/lib/ponto/task-notes.ts";

test("resolves the latest completion observation for the task occurrence", () => {
  const notes = resolveTaskOperationalNotes({
    task: { id: "task-a", status: "concluido" },
    completionEvents: [
      { task_id: "task-a", reason: "Observação antiga", created_at: "2026-09-07T10:00:00.000Z" },
      {
        task_id: "task-a",
        reason: "Cliente pediu a chave na caixa.",
        created_at: "2026-09-07T11:00:00.000Z",
      },
    ],
  });

  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.label, "Observação da conclusão");
  assert.equal(notes[0]?.text, "Cliente pediu a chave na caixa.");
});

test("does not leak a note from another occurrence", () => {
  const notes = resolveTaskOperationalNotes({
    task: { id: "task-b", status: "concluido" },
    completionEvents: [
      { task_id: "task-a", reason: "Nota da ocorrência A", created_at: "2026-09-07T11:00:00.000Z" },
    ],
  });

  assert.deepEqual(notes, []);
});

test("resolves cancellation reason and schedule request details", () => {
  const notes = resolveTaskOperationalNotes({
    task: {
      id: "task-a",
      status: "cancelado",
      assigned_to: "employee-a",
      cancelled_by: "manager-a",
      cancellation_reason: "Alteração de programação",
      cancelled_at: "2026-09-07T12:00:00.000Z",
      schedule_change_requested_date: "2026-09-10",
      schedule_change_needs_reassignment: true,
    },
  });

  assert.deepEqual(notes[0], {
    kind: "cancellation",
    label: "Motivo do cancelamento",
    text: "Alteração de programação",
    createdAt: "2026-09-07T12:00:00.000Z",
    requestedDate: "2026-09-10",
    needsReassignment: true,
  });
});

test("resolves an employee refusal from its canonical history", () => {
  const notes = resolveTaskOperationalNotes({
    task: {
      id: "task-a",
      status: "cancelado",
      assigned_to: "employee-a",
      refused_by: "employee-a",
    },
    refusals: [
      {
        id: "refusal-a",
        company_id: "company-a",
        task_id: "task-a",
        employee_id: "employee-a",
        actor_id: "employee-a",
        reason: "Consulta médica",
        previous_status: "pendente",
        new_status: "cancelado",
        created_at: "2026-09-07T13:00:00.000Z",
        schedule_change_requested_date: "2026-09-12",
        schedule_change_needs_reassignment: false,
      },
    ],
  });

  assert.equal(notes[0]?.kind, "refusal");
  assert.equal(notes[0]?.text, "Consulta médica");
  assert.equal(notes[0]?.requestedDate, "2026-09-12");
  assert.equal(notes[0]?.needsReassignment, false);
});

test("formats civil dates without timezone conversion", () => {
  assert.equal(formatCivilDate("2026-09-10"), "10/09/2026");
});
