import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { groupTotalMinutes, planGroupRebalance } from "../src/components/tasks/page/rebalance";

const t = (id: string, s: string, e: string, assigned_to = id) => ({
  id, assigned_to, status: "pendente", recurrence_date: "2026-11-24", due_at: null,
  scheduled_for: `2026-11-24T${s}:00.000Z`, scheduled_end: `2026-11-24T${e}:00.000Z`,
});

test("24/11: equipa de 2 × 1h → quem fica recebe 2h (soma da equipa, sem horas contratadas)", () => {
  const group = [t("a", "08:00", "09:00"), t("b", "08:00", "09:00")];
  expect(groupTotalMinutes(group)).toBe(120);
  const plan = planGroupRebalance(group, new Set(["b"]));
  expect(plan).toEqual([{ id: "a", start: group[0].scheduled_for, end: "2026-11-24T10:00:00.000Z", minutes: 120 }]);
});

test("3 pessoas × 1h, sai 1 → as 2 que ficam passam a 1h30 cada", () => {
  const plan = planGroupRebalance([t("a", "08:00", "09:00"), t("b", "08:00", "09:00"), t("c", "08:00", "09:00")], new Set(["c"]));
  expect(plan?.map((p) => p.minutes)).toEqual([90, 90]);
});

test("excluir ocorrência da série e desmarcar na edição também recalculam", () => {
  const del = readFileSync("src/components/tasks/DeleteRecurrenceDialog.tsx", "utf8");
  expect(del).toContain('scope === "single" ? await snapshotGroupForRebalance([task.id, ...selectedMates], () => null) : null;');
  const form = readFileSync("src/components/tasks/page/task-form.tsx", "utf8");
  expect(form).toContain("removingPeople && timesUnchanged ? await snapshotGroupForRebalance([initial.id], () => null) : null;");
});

test("arrastar para outro dia na linha de outra pessoa passa a tarefa para essa pessoa", () => {
  const cal = readFileSync("src/components/tasks/page/calendar.tsx", "utf8");
  expect(cal).toContain('const laneAssigneeId = groupBy === "assignee" && key !== "__unassigned__" ? key : null;');
  expect(cal).toContain("handlers.onMoveDate(taskId, dateKeyValue, dropAssigneeId);");
  const page = readFileSync("src/routes/app.tarefas.tsx", "utf8");
  expect(page).toContain("...(newAssignee ? { assigned_to: newAssignee } : {}),");
  expect(page).toContain("já está nesta tarefa neste dia.");
});
