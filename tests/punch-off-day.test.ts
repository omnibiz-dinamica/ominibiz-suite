import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { offDayInfo, sameClientTaskToday, taskDayKey } from "../src/lib/punch/off-day";

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
    todayLabel: "03/11/2026",
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

test("ticket 165: turno da noite começado depois da meia-noite não avisa; dia errado avisa", () => {
  // 12/11 às 00:52 numa tarefa de 11/11 às 23:30 → 1h22 de diferença: sem aviso
  expect(
    offDayInfo({ scheduled_for: "2026-11-11T23:30:00.000Z" }, new Date(2026, 10, 12, 0, 52)),
  ).toBeNull();
  // 07/11 às 09:34 numa tarefa de 08/11 às 10:00 → 24h: avisa
  const w = offDayInfo({ scheduled_for: "2026-11-08T10:00:00.000Z" }, new Date(2026, 10, 7, 9, 34));
  expect(w?.dayLabel).toBe("08/11/2026");
  expect(w?.todayLabel).toBe("07/11/2026");
  expect(w?.when).toBe("future");
  // tarefa de há um mês
  expect(
    offDayInfo({ scheduled_for: "2026-10-08T22:00:00.000Z" }, new Date(2026, 10, 8, 23, 59))?.when,
  ).toBe("past");
});

test("ticket 165: sugere a tarefa de hoje do mesmo cliente e do mesmo funcionário", () => {
  const n = new Date(2026, 10, 7, 9, 34);
  const wrong = {
    id: "a",
    client_id: "c1",
    assigned_to: "u1",
    scheduled_for: "2026-11-08T10:00:00.000Z",
  };
  const list = [
    wrong,
    {
      id: "b",
      client_id: "c1",
      assigned_to: "u2",
      scheduled_for: "2026-11-07T10:00:00.000Z",
      status: "pendente",
    },
    {
      id: "c",
      client_id: "c1",
      assigned_to: "u1",
      scheduled_for: "2026-11-07T10:00:00.000Z",
      status: "concluido",
    },
    {
      id: "d",
      client_id: "c1",
      assigned_to: "u1",
      scheduled_for: "2026-11-07T14:00:00.000Z",
      status: "pendente",
    },
  ];
  expect(sameClientTaskToday(wrong, list, n)?.id).toBe("d");
  // dois turnos hoje: o mais perto da hora atual
  const two = [
    ...list,
    {
      id: "e",
      client_id: "c1",
      assigned_to: "u1",
      scheduled_for: "2026-11-07T09:00:00.000Z",
      status: "autorizado",
    },
  ];
  expect(sameClientTaskToday(wrong, two, n)?.id).toBe("e");
  expect(sameClientTaskToday({ ...wrong, client_id: null }, list, n)).toBeNull();
});

test("ticket 165: o aviso diz o dia da tarefa e o dia de hoje", () => {
  const dlg = readFileSync(
    new URL("../src/components/ponto/OffDayPunchDialog.tsx", import.meta.url),
    "utf8",
  );
  expect(dlg).toContain("Esta tarefa é do dia");
  expect(dlg).toContain("Hoje é dia");
  expect(dlg).toContain("Usar a tarefa de hoje");
});
