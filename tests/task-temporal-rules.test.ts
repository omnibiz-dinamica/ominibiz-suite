import assert from "node:assert/strict";
import test from "node:test";
import { resolveOperationalStatus } from "../src/lib/tasks/operational-rules.ts";
import { resolveWallEndDate } from "../src/lib/tasks/contracted-hours.ts";
import { isDashboardLateStart } from "../src/lib/tasks/dashboard-rules.ts";

const scheduled = "2026-09-10T09:00:00.000Z";
const pend = (y: number, m: number, d: number, h: number, mi: number, s = 0) => new Date(y, m, d, h, mi, s);

test("12092026-001c — pendente até ao horário, atrasada 1s depois, ausente às 24h", () => {
  const task = { status: "pendente" as const, scheduled_for: scheduled };
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 10, 8, 59, 59)), "pendente");
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 10, 9, 0, 0)), "pendente");
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 10, 9, 0, 1)), "atrasada");
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 10, 9, 5, 0)), "atrasada");
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 11, 8, 59, 59)), "atrasada");
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 11, 9, 0, 0)), "ausente");
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 11, 9, 0, 1)), "ausente");
});

test("12092026-001c — estados iniciados/terminais nunca viram atrasada nem ausente", () => {
  for (const status of ["em_andamento", "concluido", "cancelado"] as const) {
    assert.equal(resolveOperationalStatus({ status, scheduled_for: scheduled }, pend(2026, 8, 12, 10, 0)), status);
  }
});

test("12092026-001c — overnight usa timestamps reais", () => {
  const task = { status: "pendente" as const, scheduled_for: "2026-09-10T18:30:00.000Z" };
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 10, 18, 30, 1)), "atrasada");
  assert.equal(resolveOperationalStatus(task, pend(2026, 8, 11, 18, 30, 0)), "ausente");
});

test("12092026-001c — dashboard usa o mesmo limiar de segundos", () => {
  const task = { status: "pendente", scheduled_for: scheduled, started_at: null };
  assert.equal(isDashboardLateStart(task, pend(2026, 8, 10, 9, 0, 0)), false);
  assert.equal(isDashboardLateStart(task, pend(2026, 8, 10, 9, 0, 1)), true);
});

test("12092026-001c — alterar só o horário de fim preserva a data da tarefa", () => {
  for (const end of ["12:01", "13:00", "18:00", "23:59"]) {
    assert.equal(resolveWallEndDate("2026-09-16", "09:00", end, "2026-09-16"), "2026-09-16");
    // desfaz um avanço automático anterior (bug do dia 17)
    assert.equal(resolveWallEndDate("2026-09-16", "09:00", end, "2026-09-17"), "2026-09-16");
  }
});

test("12092026-001c — overnight continua no dia seguinte e nunca desloca duas vezes", () => {
  assert.equal(resolveWallEndDate("2026-09-16", "18:30", "01:30", "2026-09-16"), "2026-09-17");
  assert.equal(resolveWallEndDate("2026-09-16", "18:30", "02:00", "2026-09-17"), "2026-09-17");
  // data explícita de vários dias é preservada
  assert.equal(resolveWallEndDate("2026-09-16", "09:00", "12:00", "2026-09-20"), "2026-09-20");
});
