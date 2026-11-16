import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { chosenScheduleDateWarning, slotsForDate, type ClientScheduleSlot } from "../src/lib/tasks/client-schedule";

const form = readFileSync("src/components/tasks/page/task-form.tsx", "utf8");
const base = {
  weekdays: [6], durationMinutes: 180, contractedMinutes: 180, punchMode: null, frequency: "cycle",
  intervalWeeks: 2, scheduleType: "fixed", cycleLengthWeeks: 2, cycleAnchorDate: "2026-10-03",
} as const;
const klein: ClientScheduleSlot = {
  ...base, id: "client-habitual:c1:k", title: "Klein", label: "Klein", startTime: "10:10", endTime: "12:10", cyclePosition: 1,
};
const grote: ClientScheduleSlot = {
  ...base, id: "client-habitual:c1:g", title: "Grote", label: "Grote", startTime: "12:10", endTime: "15:10", cyclePosition: 0,
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
    expect(form).toContain("scheduleChosenByManagerRef.current = true;\n                      applySlot(slot);");
    expect(form).toMatch(/if \(chosen\) \{[\s\S]*?chosenScheduleDateWarning\(chosen, dateKey\)[\s\S]*?return;\s*\}/);
    expect(form).toMatch(/if \(value === "__free__"\) \{\s*scheduleChosenByManagerRef\.current = false;/);
    expect(form).toContain("setSelectedScheduleId(null);\n      scheduleChosenByManagerRef.current = false;");
  });
});
