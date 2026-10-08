import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { recurrenceFromScheduleSlot, disableAutoRecurrence } from "../src/lib/tasks/schedule-recurrence";
import { emptyRecurrence } from "../src/components/tasks/RecurrenceForm";
import { cyclePositionForDate } from "../src/lib/tasks/client-schedule-rules";
import type { ClientScheduleSlot } from "../src/lib/tasks/client-schedule";

const page = readFileSync("src/routes/app.tarefas.tsx", "utf8");
const anchor = "2026-10-03";
const slot = (label: string, pos: number): ClientScheduleSlot => ({
  id: `client-habitual:c1:${label}`, title: label, label, weekdays: [6], startTime: "13:20", endTime: "15:20",
  durationMinutes: 120, contractedMinutes: 120, punchMode: null, frequency: "cycle", intervalWeeks: 2,
  scheduleType: "fixed", cycleLengthWeeks: 2, cyclePosition: pos, cycleAnchorDate: anchor,
});
const klein = slot("Klein", 1);

describe("programação do cliente liga a recorrência", () => {
  test("(a) Klein: weekdays, intervalo 2, início e fim vazio", () => {
    const r = recurrenceFromScheduleSlot({ ...emptyRecurrence(), endDate: "2027-01-01" }, klein, new Date(2026, 9, 8))!;
    expect(r.enabled).toBe(true);
    expect(r.weekdays).toEqual([6]);
    expect(r.intervalWeeks).toBe(2);
    expect(r.endDate).toBe("");
    expect(r.startDate).toBe("2026-10-17");
  });
  test("(c) início cai na semana Klein do ciclo", () => {
    const r = recurrenceFromScheduleSlot(emptyRecurrence(), klein, new Date(2026, 9, 8))!;
    expect(cyclePositionForDate(r.startDate, anchor, 2)).toBe(1);
    expect(new Date(r.startDate + "T12:00:00Z").getUTCDay()).toBe(6);
  });
  test("(b) payload continua com todos os slots irmãos em schedule_rules", () => {
    expect(page).toContain("schedule_name: slot.label ?? null");
    expect(page).toContain("slot.cycleAnchorDate === selectedSchedule.cycleAnchorDate");
    expect(page).toContain("schedule_rules: scheduleRulesByEmployee[index] ?? []");
  });
  test("(d) Livre / Manual desliga só a recorrência automática", () => {
    const on = { ...recurrenceFromScheduleSlot(emptyRecurrence(), klein)!, weekdays: [5, 6] };
    const off = disableAutoRecurrence(on, true);
    expect(off.enabled).toBe(false);
    expect(off.weekdays).toEqual([5, 6]);
    const manual = { ...emptyRecurrence(), enabled: true };
    expect(disableAutoRecurrence(manual, false)).toBe(manual);
  });
  test("(e) edição de tarefa existente não é afetada", () => {
    expect(page).toContain("if (!initial) applySlotRecurrence(slot);");
    expect(page).toMatch(/const applySlotRecurrence = \(slot: ClientScheduleSlot\) => \{\n\s+if \(initial\) return;/);
  });
});
