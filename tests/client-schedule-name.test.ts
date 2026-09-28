import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { parseHabitualSchedule } from "../src/lib/tasks/client-schedule";

const tasksPage = readFileSync("src/routes/app.tarefas.tsx", "utf8");

describe("programação do cliente como etiqueta da tarefa", () => {
  test("o nome dado pelo gestor é preservado na leitura do cadastro", () => {
    const [first, second] = parseHabitualSchedule([
      { label: "Klein", weekdays: [6], mode: "fixed", start_time: "13:20", end_time: "15:20" },
      { label: "Grote", weekdays: [6], mode: "fixed", start_time: "15:50", end_time: "18:50" },
    ]);
    expect(first.label).toBe("Klein");
    expect(second.label).toBe("Grote");
  });

  test("o formulário grava a etiqueta na tarefa avulsa e na série", () => {
    expect(tasksPage).toContain("schedule_name: scheduleName");
    expect(tasksPage).toContain("schedule_name: payload.schedule_name");
  });

  test("a etiqueta aparece no calendário e nas listas", () => {
    expect(tasksPage).toContain("function ScheduleNameBadge");
    expect(tasksPage).toContain("<ScheduleNameBadge name={task.schedule_name} />");
    expect(tasksPage).toContain("<ScheduleNameBadge name={t.schedule_name} />");
    expect(tasksPage).toContain("task.schedule_name ? `[${task.schedule_name}] ` : \"\"");
  });
});
