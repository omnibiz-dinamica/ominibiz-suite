import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { planPushSchedule, wallDayBounds, type PushDayTask } from "../src/lib/tasks/push-schedule";

const D = "2026-11-23";
const at = (h: string) => `${D}T${h}:00.000Z`;
const task = (id: string, s: string, e: string, extra: Partial<PushDayTask> = {}): PushDayTask => ({
  id, label: id, start: at(s), end: at(e), status: "pendente", hasPunch: false, ...extra,
});
const END = wallDayBounds(D).end;
const hm = (iso: string) => iso.slice(11, 16);

describe("Empurrar as seguintes (mesmo funcionário, mesmo dia)", () => {
  test("exemplo do Eduardo: nova 07–09 empurra 08–09 → 09–10 e 09–10 → 10–11", () => {
    const p = planPushSchedule(at("07:00"), at("09:00"), [task("a", "08:00", "09:00"), task("b", "09:00", "10:00")], END);
    expect(p.moves.map((m) => [m.id, hm(m.toStart), hm(m.toEnd)])).toEqual([
      ["a", "09:00", "10:00"],
      ["b", "10:00", "11:00"],
    ]);
    expect(p.blocked).toEqual([]);
  });

  test("mantém a duração de cada cliente e pára no primeiro intervalo livre", () => {
    const p = planPushSchedule(at("07:00"), at("09:00"), [
      task("a", "08:00", "10:30"), // 2h30
      task("b", "13:00", "14:00"), // já depois do fim empurrado (11:30): não muda
    ], END);
    expect(p.moves.map((m) => [m.id, hm(m.toStart), hm(m.toEnd)])).toEqual([["a", "09:00", "11:30"]]);
  });

  test("tarefa iniciada/com ponto não muda e as seguintes vão para depois dela", () => {
    const p = planPushSchedule(at("07:00"), at("09:30"), [
      task("a", "08:00", "09:00", { status: "em_andamento" }),
      task("b", "09:00", "10:00", { hasPunch: true }),
      task("c", "09:30", "10:30"),
    ], END);
    expect(p.blocked.map((b) => [b.id, b.reason])).toEqual([["a", "started"], ["b", "started"]]);
    expect(p.moves.map((m) => [m.id, hm(m.toStart), hm(m.toEnd)])).toEqual([["c", "10:00", "11:00"]]);
  });

  test("não passa da meia-noite; canceladas e ausentes ignoradas; começa antes só avisa", () => {
    const p = planPushSchedule(at("21:00"), at("23:30"), [
      task("x", "20:30", "21:30"),
      task("y", "22:00", "23:00", { status: "cancelado" }),
      task("z", "22:30", "23:30"),
    ], END);
    expect(p.blocked.map((b) => [b.id, b.reason])).toEqual([["x", "starts_before"], ["z", "past_midnight"]]);
    expect(p.moves).toEqual([]);
  });

  test("formulário: botão só na criação sem recorrência; aplica depois de criar", () => {
    const form = readFileSync("src/components/tasks/page/task-form.tsx", "utf8");
    expect(form).toContain('data-testid="push-schedule-preview"');
    expect(form).toContain("{!initial && !recurrence.enabled && !pushPlans && (");
    expect(form.indexOf("const moved = await applyPushMoves(companyId, moves);")).toBeGreaterThan(
      form.indexOf('.from("tasks")\n                  .insert('),
    );
  });
});

import { findFreeSlot, overlappingTasks } from "../src/lib/tasks/push-schedule";

describe("arrastar para um dia com tarefa no mesmo horário", () => {
  const day = wallDayBounds(D);
  test("sugere o primeiro horário livre com a mesma duração", () => {
    const busy = [task("a", "08:00", "09:00"), task("b", "09:00", "10:30"), task("c", "12:00", "13:00")];
    const slot = findFreeSlot(at("08:00"), 60, busy, day.start, day.end);
    expect(slot && [hm(slot.start), hm(slot.end)]).toEqual(["10:30", "11:30"]);
    expect(overlappingTasks(at("08:00"), at("09:00"), busy).map((t) => t.id)).toEqual(["a"]);
  });
  test("sem espaço até à meia-noite procura desde o início do dia; canceladas não ocupam", () => {
    const busy = [task("a", "20:00", "23:59"), task("x", "06:00", "07:00", { status: "cancelado" })];
    const slot = findFreeSlot(at("22:00"), 120, busy, day.start, day.end);
    expect(slot && [hm(slot.start), hm(slot.end)]).toEqual(["00:00", "02:00"]);
  });
});
