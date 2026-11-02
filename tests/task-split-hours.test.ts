import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { addWallMinutes, distributeContractedMinutes } from "../src/lib/tasks/contracted-hours";
import { dailyShiftDurationMinutes, taskDurationMinutes, LONG_STANDALONE_TASK_MINUTES } from "../src/lib/tasks/daily-shift-duration";
import { tasksPageSource } from "./helpers/tasks-page-source";

const form = tasksPageSource();

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
  expect(form).toMatch(/taskDurationMinutes\(startDate, startTime, endDate, endTime, recurrence.enabled\)/);
  expect(form).toMatch(/const contractedMinutes = clientContractedMinutes \?\? taskTotalMinutes;/);
  // A hora de fim digitada só bloqueia a divisão quando a carga vem do cadastro.
  expect(form).toMatch(/const endTypedByManager = manualEndOverride && !splitFromTaskTimes;/);
  expect(form).toMatch(/contractedMinutes != null &&\s+!endTypedByManager &&/);
});

test("avulsa 01/12 08:00 → 03/12 17:00 mantém 3420 minutos e o fim para uma pessoa", () => {
  const total = taskDurationMinutes("2026-12-01", "08:00", "2026-12-03", "17:00", false);
  expect(total).toBe(3420);
  const shares = distributeContractedMinutes(total, 1);
  expect(shares).toEqual([3420]);
  expect(addWallMinutes("2026-12-01", "08:00", shares[0])).toEqual({ date: "2026-12-03", time: "17:00" });
  expect(total !== null && total > LONG_STANDALONE_TASK_MINUTES).toBe(true);
  expect(form).toMatch(/\(!useContractedSchedule \|\| splitFromTaskTimes\) &&\s+manualDurationMinutes > LONG_STANDALONE_TASK_MINUTES/);
});

test("avulsa de vários dias divide a duração completa por duas pessoas", () => {
  const total = taskDurationMinutes("2026-12-01", "08:00", "2026-12-03", "17:00", false);
  const shares = distributeContractedMinutes(total, 2);
  expect(shares).toEqual([1710, 1710]);
  expect(addWallMinutes("2026-12-01", "08:00", shares[0])).toEqual({ date: "2026-12-02", time: "12:30" });
});

test("série no mesmo intervalo continua a dividir somente as 9 horas diárias", () => {
  const total = taskDurationMinutes("2026-12-01", "08:00", "2026-12-03", "17:00", true);
  expect(total).toBe(540);
  expect(distributeContractedMinutes(total, 2)).toEqual([270, 270]);
});

test("avulsa noturna mantém o dia seguinte e sem hora de fim não deriva duração", () => {
  expect(taskDurationMinutes("2026-12-01", "22:00", "2026-12-01", "06:00", false)).toBe(480);
  expect(taskDurationMinutes("2026-12-01", "08:00", "2026-12-03", "", false)).toBeNull();
});

test("edição: a divisão vem do banco e o gestor é avisado", () => {
  expect(form).toMatch(/"task_group_edit_occurrence"/);
  expect(form).toMatch(/Horas divididas por \$\{split\.split_people\} pessoas/);
  expect(form).toMatch(/split\?\.split_skipped === "started"/);
  // prévia na edição: sem carga, só ao acrescentar (horário × pessoas que já estavam)
  expect(form).toMatch(/if \(count < groupAssignees\.length\) return null;/);
  expect(form).toMatch(/minutes \* Math\.max\(groupAssignees\.length, 1\)/);
});
