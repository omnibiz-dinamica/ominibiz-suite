import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { entryScheduleFlags, localKey } = await import("../src/lib/punch/off-schedule");

// Hora marcada = "hora de parede" (06:00 gravado como 06:00Z); ponto = instante real.
const task = {
  scheduled_for: "2026-11-03T06:00:00.000Z",
  scheduled_end: "2026-11-03T12:00:00.000Z",
};

test("hora local do ponto no fuso de onde se marcou", () => {
  // 05:00Z = 06:00 em Bruxelas (inverno)
  expect(localKey("2026-11-03T05:00:00Z", "Europe/Brussels")).toBe("2026-11-03 06:00");
  expect(localKey("2026-11-03T05:00:00Z", "Europe/Lisbon")).toBe("2026-11-03 05:00");
});

test("na hora marcada: sem vermelho", () => {
  const f = entryScheduleFlags({
    started_at: "2026-11-03T05:00:20Z",
    ended_at: "2026-11-03T11:00:00Z",
    effective_minutes: 360,
    ...task,
    clientName: "Faculty Club",
    timeZone: "Europe/Brussels",
  });
  expect(f).toEqual({ start: false, end: false, over6h: false, coifa: false });
});

test("entrada e saída diferentes: vermelho nas duas", () => {
  const f = entryScheduleFlags({
    started_at: "2026-11-03T05:17:00Z",
    ended_at: "2026-11-03T11:30:00Z",
    effective_minutes: 373,
    ...task,
    clientName: "Faculty Club",
    timeZone: "Europe/Brussels",
  });
  expect(f.start && f.end).toBe(true);
});

test("Coifa: só a entrada e mais de 6 h; a saída não conta", () => {
  const f = entryScheduleFlags({
    started_at: "2026-11-03T05:00:00Z",
    ended_at: "2026-11-03T13:00:00Z",
    effective_minutes: 480,
    ...task,
    clientName: "Coifa CM",
    timeZone: "Europe/Brussels",
  });
  expect(f).toEqual({ start: false, end: false, over6h: true, coifa: true });
});

test("tarefa sem horário (00:00) e ponto aberto não ficam a vermelho", () => {
  const f = entryScheduleFlags({
    started_at: "2026-11-03T09:13:00Z",
    ended_at: null,
    effective_minutes: null,
    scheduled_for: "2026-11-03T00:00:00.000Z",
    scheduled_end: "2026-11-03T12:00:00.000Z",
    clientName: "Faculty Club",
    timeZone: "Europe/Brussels",
  });
  expect(f.start || f.end || f.over6h).toBe(false);
});

test("FOLGA REMUNERADA nunca fica a vermelho", () => {
  const f = entryScheduleFlags({
    started_at: "2026-11-03T04:55:00Z",
    ended_at: "2026-11-03T04:55:30Z",
    effective_minutes: 0,
    ...task,
    clientName: "FOLGA REMUNERADA",
    timeZone: "Europe/Brussels",
  });
  expect(f.start || f.end || f.over6h).toBe(false);
});

test("Gestão de Ponto marca entrada, fim e efetivo a vermelho", () => {
  const g = readFileSync(new URL("../src/routes/app.ponto_.gestao.tsx", import.meta.url), "utf8");
  expect(g).toMatch(/entryScheduleFlags\(\{/);
  expect(g).toMatch(/offCellClass\(offByRow\.get\(r\.id\)\?\.start\)/);
  expect(g).toMatch(/offCellClass\(offByRow\.get\(r\.id\)\?\.end\)/);
  expect(g).toMatch(/offCellClass\(offByRow\.get\(r\.id\)\?\.over6h\)/);
  expect(g).toMatch(/fetchEntryTimeZones\(pauseEntryIds\)/);
});

test("folha impressa: sem a linha vermelha de explicação; observação do funcionário fica", () => {
  const pdf = readFileSync(new URL("../src/lib/timesheet-pdf.ts", import.meta.url), "utf8");
  expect(pdf).not.toMatch(/offScheduleText/);
  expect(pdf).toMatch(/tr\("Obs\."\)\} \(/);
});
