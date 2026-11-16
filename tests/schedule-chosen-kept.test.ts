import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  chosenScheduleDateWarning,
  editScheduleName,
  savedScheduleSlotId,
  slotsForDate,
  type ClientScheduleSlot,
} from "../src/lib/tasks/client-schedule";

const form = readFileSync("src/components/tasks/page/task-form.tsx", "utf8");
const base = {
  weekdays: [6],
  durationMinutes: 180,
  contractedMinutes: 180,
  punchMode: null,
  frequency: "cycle",
  intervalWeeks: 2,
  scheduleType: "fixed",
  cycleLengthWeeks: 2,
  cycleAnchorDate: "2026-10-03",
} as const;
const klein: ClientScheduleSlot = {
  ...base,
  id: "client-habitual:c1:k",
  title: "Klein",
  label: "Klein",
  startTime: "10:10",
  endTime: "12:10",
  cyclePosition: 1,
};
const grote: ClientScheduleSlot = {
  ...base,
  id: "client-habitual:c1:g",
  title: "Grote",
  label: "Grote",
  startTime: "12:10",
  endTime: "15:10",
  cyclePosition: 0,
};

describe("16/11 — programação escolhida pelo gestor não é trocada ao mudar a data", () => {
  test("numa data da semana da Grote, Klein escolhida dá só um aviso", () => {
    const groteDay = "2026-10-17";
    expect(slotsForDate([klein, grote], groteDay).map((s) => s.label)).toEqual(["Grote"]);
    const w = chosenScheduleDateWarning(klein, groteDay)!;
    expect(w.startsWith("Atenção:")).toBe(true);
    expect(w).toContain("programação Klein foi mantida");
  });
  test("data que coincide com a Klein: sem aviso", () => {
    expect(chosenScheduleDateWarning(klein, "2026-10-24")).toBeNull();
  });
  test("o formulário mantém a escolha e não aplica outra programação", () => {
    expect(form).toContain(
      "scheduleChosenByManagerRef.current = true;\n                      setScheduleClearedInEdit(false);\n                      applySlot(slot);",
    );
    expect(form).toMatch(
      /if \(chosen\) \{[\s\S]*?chosenScheduleDateWarning\(chosen, dateKey\)[\s\S]*?return;\s*\}/,
    );
    expect(form).toMatch(
      /if \(value === "__free__"\) \{\s*scheduleChosenByManagerRef\.current = false;/,
    );
    expect(form).toContain(
      "setSelectedScheduleId(null);\n      scheduleChosenByManagerRef.current = false;",
    );
  });
});

describe("16/11 — na edição aparece a programação (Klein/Grote) e pode trocar", () => {
  test("o seletor mostra a programação gravada", () => {
    expect(savedScheduleSlotId([klein, grote], "Klein")).toBe(klein.id);
    expect(savedScheduleSlotId([klein, grote], " grote ")).toBe(grote.id);
    expect(savedScheduleSlotId([klein, grote], null)).toBeNull();
    expect(savedScheduleSlotId([klein, grote], "Outra")).toBeNull();
  });
  test("etiqueta gravada na edição", () => {
    const base = { chosenLabel: null, cleared: false, sameClient: true, savedLabel: "Klein" };
    expect(editScheduleName(base)).toBe("Klein"); // não mexeu: mantém
    expect(editScheduleName({ ...base, chosenLabel: "Grote" })).toBe("Grote"); // trocou
    expect(editScheduleName({ ...base, cleared: true })).toBeNull(); // Livre / Manual
    expect(editScheduleName({ ...base, sameClient: false })).toBeNull(); // trocou o cliente
  });
  test("formulário: seletor também na edição, carregado sem alterar a tarefa", () => {
    expect(form).toContain(
      '{namedSchedules.length > 0 && (\n              <div className="space-y-1" data-testid="client-schedule-picker">',
    );
    expect(form).toContain("if (initial?.client_id) void loadClientSchedule(initial.client_id);");
    expect(form).toContain("savedScheduleSlotId(namedSchedules, initial.schedule_name)");
    expect(form).toContain("schedule_name: initial\n                  ? editScheduleName({");
    expect(form).toContain('data-testid="schedule-hint-edit"');
  });
});
