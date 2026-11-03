import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { offDayInfo, taskDayKey } from "../src/lib/punch/off-day";

// 03/11/2026 às 10:00 locais
const now = new Date(2026, 10, 3, 10, 0, 0);

test("data da tarefa: scheduled_for, senão recurrence_date, senão due_at", () => {
  expect(
    taskDayKey({ scheduled_for: "2026-11-02T08:00:00.000Z", recurrence_date: "2026-11-05" }),
  ).toBe("2026-11-02");
  expect(taskDayKey({ recurrence_date: "2026-11-05" })).toBe("2026-11-05");
  expect(taskDayKey({ due_at: "2026-11-04T18:00:00.000Z" })).toBe("2026-11-04");
  expect(taskDayKey({})).toBeNull();
});

test("tarefa de hoje: sem aviso", () => {
  expect(offDayInfo({ scheduled_for: "2026-11-03T23:30:00.000Z" }, now)).toBeNull();
  expect(offDayInfo({}, now)).toBeNull();
});

test("tarefa de ontem e de amanhã: aviso com a data e o sentido", () => {
  expect(offDayInfo({ scheduled_for: "2026-11-02T08:00:00.000Z" }, now)).toEqual({
    dayKey: "2026-11-02",
    dayLabel: "02/11/2026",
    when: "past",
  });
  expect(offDayInfo({ recurrence_date: "2026-11-04" }, now)?.when).toBe("future");
});

test("todos os inícios de ponto passam pelo aviso", () => {
  const ponto = readFileSync(new URL("../src/routes/app.ponto.tsx", import.meta.url), "utf8");
  const handle = ponto.slice(ponto.indexOf("const handleStart = (t: TaskRow) => {"));
  expect(handle.slice(0, 200)).toMatch(/if \(offDayInfo\(t\)\) \{\s*setOffDayTask\(t\);\s*return;/);
  expect(ponto).toMatch(/<OffDayPunchDialog/);
  expect(ponto).toMatch(/onStart=\{handleStart\}/);
});
