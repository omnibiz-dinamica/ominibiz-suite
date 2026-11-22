import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  addDaysKey,
  mondayOf,
  planCalendarPdf,
  taskLine,
  type CalendarPdfTask,
} from "../src/lib/tasks/calendar-pdf";

const t = (
  id: string,
  day: string,
  who: string,
  client: string,
  start = "09:00",
  end = "12:30",
): CalendarPdfTask => ({
  id,
  title: `Cliente ${client}`,
  assigned_to: who,
  client_id: client,
  scheduled_for: `${day}T${start}:00.000Z`,
  scheduled_end: `${day}T${end}:00.000Z`,
  recurrence_date: day,
  due_at: null,
  status: "pendente",
});
const names: Record<string, string> = { a: "Ana", b: "Bruno" };
const base = {
  memberName: (id: string | null) => (id ? (names[id] ?? id) : "Sem responsável"),
  clientName: (id: string | null) => (id ? `Cliente ${id}` : "Sem cliente"),
};
const tasks = [
  t("1", "2026-11-23", "a", "X"),
  t("2", "2026-11-25", "b", "Y", "14:00", "16:00"),
  t("3", "2026-11-30", "a", "X"), // semana seguinte
];

describe("PDF do calendário de tarefas", () => {
  test("semana de segunda a domingo", () => {
    expect(mondayOf("2026-11-26")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(addDaysKey("2026-11-30", 2)).toBe("2026-12-02");
  });

  test("sem seleção: todas as tarefas da semana, por colaborador", () => {
    const p = planCalendarPdf({
      ...base,
      tasks,
      selectedIds: new Set(),
      anyDayOfWeek: "2026-11-26",
      groupBy: "assignee",
    });
    expect(p.source).toBe("todas");
    expect(p.taskCount).toBe(2);
    expect(p.days.map((d) => d.label)).toEqual([
      "Seg 23/11",
      "Ter 24/11",
      "Qua 25/11",
      "Qui 26/11",
      "Sex 27/11",
      "Sáb 28/11",
      "Dom 29/11",
    ]);
    expect(p.rows.map((r) => r.label)).toEqual(["Ana", "Bruno"]);
    expect(p.rows[0].cells[0]).toBe("09:00–12:30 Cliente X");
    expect(p.rows[1].cells[2]).toBe("14:00–16:00 Cliente Y");
  });

  test("com seleção: só as selecionadas", () => {
    const p = planCalendarPdf({
      ...base,
      tasks,
      selectedIds: new Set(["2"]),
      anyDayOfWeek: "2026-11-23",
      groupBy: "assignee",
    });
    expect(p.source).toBe("selecionadas");
    expect(p.taskCount).toBe(1);
    expect(p.rows.map((r) => r.label)).toEqual(["Bruno"]);
  });

  test("por cliente mostra o colaborador entre parênteses", () => {
    const p = planCalendarPdf({
      ...base,
      tasks,
      selectedIds: undefined,
      anyDayOfWeek: "2026-11-23",
      groupBy: "client",
    });
    expect(p.rows.find((r) => r.label === "Cliente X")?.cells[0]).toBe(
      "09:00–12:30 Cliente X (Ana)",
    );
  });

  test("linha de tarefa sem hora e cancelada", () => {
    expect(
      taskLine({ ...tasks[0], scheduled_for: null, scheduled_end: null, status: "cancelado" }),
    ).toBe("Cliente X [cancelada]");
  });

  test("botão no calendário", () => {
    const cal = readFileSync("src/components/tasks/page/calendar.tsx", "utf8");
    expect(cal).toContain('data-testid="calendar-export-pdf"');
    expect(cal).toContain("selectedIds: handlers.selectedTaskIds");
  });
});
