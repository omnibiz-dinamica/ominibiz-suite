import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { durationFromTimes, endTimeFromDuration } from "../src/lib/tasks/start-end-time";

describe("Editar recorrência: hora de início e de fim", () => {
  test("início + duração → fim", () => {
    expect(endTimeFromDuration("09:00", 210)).toBe("12:30");
    expect(endTimeFromDuration("22:00", 240)).toBe("02:00");
    expect(endTimeFromDuration("09:00", 0)).toBe("");
    expect(endTimeFromDuration("", 60)).toBe("");
  });

  test("início e fim → duração (fim antes do início = dia seguinte)", () => {
    expect(durationFromTimes("09:00", "12:30")).toBe(210);
    expect(durationFromTimes("22:00", "02:00")).toBe(240);
    expect(durationFromTimes("09:00", "")).toBe(0);
    expect(durationFromTimes("09:00", "09:00")).toBe(1440);
  });

  test("a janela mostra Hora de início e Hora de fim (sem Duração (min))", () => {
    const dlg = readFileSync("src/components/tasks/EditRecurrenceDialog.tsx", "utf8");
    expect(dlg).toContain("<Label>Hora de início</Label>");
    expect(dlg).toContain("<Label>Hora de fim</Label>");
    expect(dlg).not.toContain("Duração (min)");
    expect(dlg).toContain('data-testid="recurrence-end-time"');
  });
});
