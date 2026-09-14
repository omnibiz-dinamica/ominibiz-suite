import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDashboardTask,
  countDashboardTasks,
  localDayKey,
  taskOperationalDay,
} from "../src/lib/tasks/dashboard-counters.ts";

const now = new Date(2026, 8, 14, 12, 0, 0); // 14/09/2026 12:00 local

test("dia operacional vem do agendamento, da ocorrencia ou do prazo, nunca de created_at", () => {
  assert.equal(taskOperationalDay({ status: "pendente", scheduled_for: "2026-09-14T09:00:00.000Z" }), "2026-09-14");
  assert.equal(taskOperationalDay({ status: "pendente", recurrence_date: "2026-09-13" }), "2026-09-13");
  assert.equal(taskOperationalDay({ status: "pendente", due_at: "2026-09-12T23:59:59.000Z" }), "2026-09-12");
  assert.equal(taskOperationalDay({ status: "pendente" }), null);
});

test("categorias sao mutuamente exclusivas", () => {
  assert.equal(classifyDashboardTask({ status: "cancelado", refused_by: "emp" }, now), "recusada");
  assert.equal(classifyDashboardTask({ status: "cancelado", refused_by: null }, now), "cancelada");
  assert.equal(
    classifyDashboardTask({ status: "concluido", scheduled_for: "2026-09-14T08:00:00.000Z" }, now),
    "concluido",
  );
  assert.equal(
    classifyDashboardTask({ status: "em_andamento", scheduled_for: "2026-09-14T08:00:00.000Z" }, now),
    "em_andamento",
  );
});

test("pendente do dia com horario futuro nao e atrasada; horario passado e atrasada", () => {
  assert.equal(
    classifyDashboardTask({ status: "pendente", scheduled_for: "2026-09-14T18:00:00.000Z" }, now),
    "pendente",
  );
  assert.equal(
    classifyDashboardTask({ status: "autorizado", scheduled_for: "2026-09-14T09:00:00.000Z" }, now),
    "atrasada",
  );
});

test("tarefa de ontem nao concluida conta como atrasada, nunca como pendente", () => {
  const yesterday = { status: "pendente", scheduled_for: "2026-09-13T09:00:00.000Z" };
  assert.equal(classifyDashboardTask(yesterday, now), "atrasada");
  const counts = countDashboardTasks([yesterday], { day: "2026-09-13", now });
  assert.equal(counts.atrasada, 1);
  assert.equal(counts.pendente, 0);
});

test("contadores do dia atual zeram quando nao existem tarefas do dia", () => {
  const counts = countDashboardTasks(
    [
      { id: "1", status: "concluido", scheduled_for: "2026-09-13T09:00:00.000Z" },
      { id: "2", status: "cancelado", scheduled_for: "2026-09-13T09:00:00.000Z" },
    ],
    { day: "2026-09-14", now },
  );
  assert.deepEqual(counts, {
    pendente: 0,
    em_andamento: 0,
    concluido: 0,
    atrasada: 0,
    cancelada: 0,
    recusada: 0,
    ausente: 0,
  });
});

test("contagem do dia atual usa apenas as tarefas do dia e nao duplica a mesma tarefa", () => {
  const tasks = [
    { id: "a", status: "pendente", scheduled_for: "2026-09-14T18:00:00.000Z" },
    { id: "a", status: "pendente", scheduled_for: "2026-09-14T18:00:00.000Z" },
    { id: "b", status: "em_andamento", scheduled_for: "2026-09-14T08:00:00.000Z" },
    { id: "c", status: "concluido", scheduled_for: "2026-09-14T07:00:00.000Z" },
    { id: "d", status: "cancelado", scheduled_for: "2026-09-14T07:00:00.000Z" },
    { id: "e", status: "cancelado", refused_by: "emp", scheduled_for: "2026-09-14T07:00:00.000Z" },
    { id: "f", status: "pendente", recurrence_date: "2026-09-14" },
    { id: "g", status: "pendente", scheduled_for: "2026-09-13T09:00:00.000Z" },
  ];
  const counts = countDashboardTasks(tasks, { day: "2026-09-14", now });
  assert.equal(counts.pendente, 2);
  assert.equal(counts.em_andamento, 1);
  assert.equal(counts.concluido, 1);
  assert.equal(counts.cancelada, 1);
  assert.equal(counts.recusada, 1);
  assert.equal(counts.atrasada, 0);
});

test("tarefas arquivadas ou removidas nunca entram nos contadores", () => {
  assert.equal(classifyDashboardTask({ status: "pendente", archived_at: "2026-09-14T10:00:00.000Z" }, now), null);
  assert.equal(classifyDashboardTask({ status: "pendente", deleted_at: "2026-09-14T10:00:00.000Z" }, now), null);
});

test("localDayKey usa o dia local do dispositivo", () => {
  assert.equal(localDayKey(new Date(2026, 8, 14, 23, 30)), "2026-09-14");
  assert.equal(localDayKey(new Date(2026, 8, 15, 0, 5)), "2026-09-15");
});
