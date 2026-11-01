import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { distributeContractedMinutes } from "../src/lib/tasks/contracted-hours";
import { dailyShiftDurationMinutes } from "../src/lib/tasks/daily-shift-duration";

const form = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");

// SUP-2026-000315 — sem carga no cadastro do cliente, divide o horário da própria tarefa.
test("08:00–11:00 para 2 pessoas = 1h30 cada; para 3 = 1h cada", () => {
  const total = dailyShiftDurationMinutes("08:00", "11:00");
  expect(total).toBe(180);
  expect(distributeContractedMinutes(total, 2)).toEqual([90, 90]);
  expect(distributeContractedMinutes(total, 3)).toEqual([60, 60, 60]);
  expect(distributeContractedMinutes(total, 1)).toEqual([180]);
});

test("criação: carga do cliente primeiro; sem ela, o horário da tarefa", () => {
  expect(form).toMatch(
    /const clientContractedMinutes = selectedSchedule\?\.contractedMinutes \?\? selectedClient\?\.contracted_minutes \?\? null;/,
  );
  expect(form).toMatch(/!initial && startTime && endTime \? dailyShiftDurationMinutes\(startTime, endTime\) \|\| null : null/);
  expect(form).toMatch(/const contractedMinutes = clientContractedMinutes \?\? taskTotalMinutes;/);
  // A hora de fim digitada só bloqueia a divisão quando a carga vem do cadastro.
  expect(form).toMatch(/const endTypedByManager = manualEndOverride && !splitFromTaskTimes;/);
  expect(form).toMatch(/contractedMinutes != null &&\s+!endTypedByManager &&/);
});

test("edição: a divisão vem do banco e o gestor é avisado", () => {
  expect(form).toMatch(/"task_group_edit_occurrence"/);
  expect(form).toMatch(/Horas divididas por \$\{split\.split_people\} pessoas/);
  expect(form).toMatch(/split\?\.split_skipped === "started"/);
  // prévia na edição: sem carga, só ao acrescentar (horário × pessoas que já estavam)
  expect(form).toMatch(/if \(count < groupAssignees\.length\) return null;/);
  expect(form).toMatch(/minutes \* Math\.max\(groupAssignees\.length, 1\)/);
});
