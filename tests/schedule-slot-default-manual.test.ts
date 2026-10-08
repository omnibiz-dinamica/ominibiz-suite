import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { recurrenceFromScheduleSlot, disableAutoRecurrence, scheduleSlotSummary } from "../src/lib/tasks/schedule-recurrence";
import { emptyRecurrence } from "../src/components/tasks/RecurrenceForm";
import type { ClientScheduleSlot } from "../src/lib/tasks/client-schedule";

const page = readFileSync("src/routes/app.tarefas.tsx", "utf8");
const form = readFileSync("src/components/tasks/RecurrenceForm.tsx", "utf8");
const klein: ClientScheduleSlot = {
  id: "client-habitual:c1:k", title: "Klein", label: "Klein", weekdays: [6], startTime: "10:00", endTime: "13:00",
  durationMinutes: 180, contractedMinutes: 180, punchMode: null, frequency: "cycle", intervalWeeks: 2,
  scheduleType: "fixed", cycleLengthWeeks: 2, cyclePosition: 1, cycleAnchorDate: "2026-10-03",
};

describe("programação começa em Livre / Manual", () => {
  test("(a) escolher o cliente não pré-seleciona nem preenche", () => {
    expect(page).toContain("if (!hasNamed) suggestFromSchedule(slots, startDate);");
    expect(page).toContain('value={selectedScheduleId ?? "__free__"}');
  });
  test("(b) Klein liga, abre o bloco e mostra o resumo", () => {
    const r = recurrenceFromScheduleSlot(emptyRecurrence(), klein, new Date(2026, 9, 8))!;
    expect(r.enabled).toBe(true);
    expect(r.endDate).toBe("");
    expect(scheduleSlotSummary(klein)).toBe("Quinzenal · Sábado · 10:00–13:00 · Klein · sem data final");
    expect(form).toContain("if (value.enabled) setOpen(true);");
    expect(form).toContain("Confira a recorrência antes de criar a tarefa");
    expect(page).toContain('body.scrollTo({ top, behavior: "smooth" })');
  });
  test("(c) Livre / Manual desliga só o automático", () => {
    const on = { ...recurrenceFromScheduleSlot(emptyRecurrence(), klein)!, scheduledTime: "09:00" };
    const off = disableAutoRecurrence(on, true);
    expect(off.enabled).toBe(false);
    expect(off.scheduledTime).toBe("09:00");
  });
  test("(d) trocar de cliente volta para Livre / Manual", () => {
    expect(page).toMatch(/const slots = await fetchClientSchedule\(cid\);\n\s+setClientSchedule\(slots\);\n\s+setSelectedScheduleId\(null\);/);
    expect(page).toContain("if (!initial && autoRecurrenceRef.current && cid !== clientId)");
  });
  test("(e) edição não é afetada", () => {
    expect(page).toContain("summary={!initial && recurrence.enabled");
    expect(page).toContain("if (!initial) applySlotRecurrence(slot);");
  });
});
