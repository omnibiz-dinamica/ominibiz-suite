import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  parseHabitualSchedule,
  slotTimesForTeam,
  teamStartTimeFor,
} from "../src/lib/tasks/client-schedule";
import { describeClientSchedule } from "../src/lib/tasks/client-card";

const tasksPage = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
const clientsPage = readFileSync(new URL("../src/routes/app.clientes.tsx", import.meta.url), "utf8");

const slotJson = {
  id: "slot-1",
  label: "Geral",
  weekdays: [1, 3, 5],
  mode: "fixed",
  start_time: "08:30",
  end_time: "10:00",
  contracted_minutes: 180,
  team_variations: [
    { team_size: 1, start_time: "07:30" },
    { team_size: 1, start_time: "06:00" }, // repetido: ignorado
    { team_size: 0, start_time: "05:00" }, // inválido: ignorado
    { team_size: 3, start_time: "bad" }, // inválido: ignorado
  ],
};

describe("entrada conforme o número de pessoas", () => {
  test("lê só variações válidas e sem repetição", () => {
    const [slot] = parseHabitualSchedule([slotJson]);
    expect(slot.teamVariations).toEqual([{ teamSize: 1, startTime: "07:30" }]);
  });

  test("programação sem variações continua igual (sem chave nova)", () => {
    const [slot] = parseHabitualSchedule([{ ...slotJson, team_variations: undefined }]);
    expect("teamVariations" in slot).toBe(false);
  });

  test("2 pessoas: horário normal 08:30–10:00; 1 pessoa: 07:30–10:30 (carga 3h igual)", () => {
    const [parsed] = parseHabitualSchedule([slotJson]);
    const slot = { ...parsed, contractedMinutes: 180 };
    expect(slotTimesForTeam(slot, 2)).toEqual({ startTime: "08:30", endTime: "10:00", adjusted: false });
    expect(slotTimesForTeam(slot, 1)).toEqual({ startTime: "07:30", endTime: "10:30", adjusted: true });
    expect(teamStartTimeFor(slot, 3)).toBeNull();
  });

  test("o cartão do cliente mostra a entrada alternativa", () => {
    const lines = describeClientSchedule({ habitual_schedule: [slotJson], contracted_minutes: 180 });
    expect(lines[0]).toContain("1 pessoa: entrada 07:30");
  });

  test("formulário de tarefa ajusta a entrada só em tarefas novas e sem horário digitado", () => {
    expect(tasksPage).toMatch(/if \(initial \|\| touchedTimes \|\| !selectedSchedule\?\.teamVariations\?\.length/);
    expect(tasksPage).toMatch(/slotTimesForTeam\(selectedSchedule, teamSize\)/);
  });

  test("excluir um colega usa a entrada de quem fica, mantendo a carga e só tarefas não iniciadas", () => {
    expect(tasksPage).toMatch(/teamStartTimeFor\(\{ teamVariations: snapshot\.teamVariations \}, remaining\.length\)/);
    expect(tasksPage).toMatch(/\{ scheduled_for: start, scheduled_end: end, due_at: end \}/);
    expect(tasksPage).toMatch(/\["pendente", "autorizado"\]\.includes\(String\(t\.status\)\)/);
  });

  test("cadastro do cliente grava team_variations validado", () => {
    expect(clientsPage).toMatch(/team_variations: \[\.\.\.teamVariations\]/);
    expect(clientsPage).toMatch(/Entrada conforme o nº de pessoas/);
  });
});
