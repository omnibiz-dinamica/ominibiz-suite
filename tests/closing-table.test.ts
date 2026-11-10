import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  addPointDefaults,
  buildClosingRows,
  isClosingLocked,
  launchDefaults,
} from "../src/lib/ponto/closing-table";
import type { ReconciliationRow } from "../src/lib/ponto/reconciliation";
import type { SnapshotDay, SnapshotEntry } from "../src/lib/timesheet";

const rec = (o: Partial<ReconciliationRow>): ReconciliationRow =>
  ({
    row_key: o.row_key ?? Math.random().toString(),
    kind: "task",
    work_date: "2026-10-06",
    task_id: null,
    time_entry_id: null,
    task_title: null,
    task_status: null,
    client_name: null,
    planned_start: null,
    planned_end: null,
    planned_minutes: null,
    scheduled_for: null,
    scheduled_end: null,
    real_start: null,
    real_end: null,
    real_minutes: 0,
    entries_count: 0,
    diff_minutes: null,
    counted_minutes: 0,
    status: "ok",
    decision: null,
    decision_stale: false,
    decided_by_name: null,
    decided_at: null,
    notes: null,
    period_status: null,
    period_locked: false,
    actions: [],
    ...o,
  }) as ReconciliationRow;

const entry = (o: Partial<SnapshotEntry>): SnapshotEntry =>
  ({
    time_entry_id: "e",
    task_id: null,
    task_title: null,
    client_id: null,
    client_name: null,
    entry_kind: "work",
    started_at: "",
    ended_at: null,
    time_zone: null,
    started_local: null,
    ended_local: null,
    first_in_local: null,
    last_out_local: null,
    break_minutes: 0,
    worked_minutes: 0,
    effective_minutes: 0,
    start_off: false,
    end_off: false,
    over_6h: false,
    ...o,
  }) as SnapshotEntry;

const day = (work_date: string, o: Partial<SnapshotDay> = {}): SnapshotDay => ({
  work_date,
  first_in: null,
  last_out: null,
  worked_minutes: 0,
  break_minutes: 0,
  entries_count: 0,
  confirmed_at: null,
  ...o,
});

describe("tabela única do fechamento", () => {
  test("todos os dias do mês aparecem, os vazios como 'empty'", () => {
    const rows = buildClosingRows(2026, 10, [], { days: [] });
    expect(rows).toHaveLength(31);
    expect(rows.every((r) => r.kind === "empty" && r.firstOfDay)).toBe(true);
    expect(rows[0].date).toBe("2026-10-01");
    expect(rows[30].date).toBe("2026-10-31");
  });

  test("conferência por dia, pausas e observação vindas da folha", () => {
    const rows = buildClosingRows(
      2026,
      10,
      [
        rec({ row_key: "a", task_id: "t1", entries_count: 1, real_minutes: 240 }),
        rec({ row_key: "b", kind: "missing", task_id: "t2" }),
        rec({ row_key: "c", kind: "unplanned", time_entry_id: "x9", entries_count: 1 }),
      ],
      {
        days: [
          day("2026-10-06", {
            entries: [
              entry({ time_entry_id: "x1", task_id: "t1", break_minutes: 15 }),
              entry({ time_entry_id: "x2", task_id: "t1", break_minutes: 10 }),
              entry({ time_entry_id: "x9", break_minutes: 5 }),
            ],
            task_notes: [
              {
                task_id: "t1",
                title: null,
                client_name: null,
                note: "Chave na portaria",
                created_at: "",
              },
            ],
          }),
        ],
      },
    );
    expect(rows).toHaveLength(30 + 3);
    const d6 = rows.filter((r) => r.date === "2026-10-06");
    expect(d6.map((r) => r.kind)).toEqual(["reconciliation", "reconciliation", "reconciliation"]);
    expect(d6.map((r) => r.firstOfDay)).toEqual([true, false, false]);
    expect(d6[0].breakMinutes).toBe(25);
    expect(d6[0].note).toBe("Chave na portaria");
    expect(d6[1].breakMinutes).toBeNull(); // falta: sem ponto
    expect(d6[2].breakMinutes).toBe(5);
  });

  test("folga remunerada e férias vêm da folha; dia com férias e sem ponto não fica vazio", () => {
    const rows = buildClosingRows(2026, 10, [], {
      days: [
        day("2026-10-02", {
          entries: [entry({ time_entry_id: "pl", entry_kind: "paid_leave", worked_minutes: 480 })],
        }),
        day("2026-10-03", { day_type: "vacation" }),
      ],
    });
    expect(rows.find((r) => r.date === "2026-10-02")?.kind).toBe("paid_leave");
    expect(rows.find((r) => r.date === "2026-10-03")?.kind).toBe("vacation");
    expect(rows).toHaveLength(31);
  });

  test("folha assinada ou com versão bloqueia ações por linha", () => {
    expect(isClosingLocked({ status: "aguardando_funcionario", current_version: 0 })).toBe(false);
    expect(isClosingLocked({ status: "em_aberto", current_version: 0 })).toBe(false);
    expect(isClosingLocked({ status: "assinado_funcionario", current_version: 0 })).toBe(true);
    expect(isClosingLocked({ status: "fechado_gestor", current_version: 0 })).toBe(true);
    expect(isClosingLocked({ status: "aguardando_correcao", current_version: 2 })).toBe(true);
  });

  test("Adicionar ponto usa a data da linha; Lançar ponto em recorrência usa só a hora do fim", () => {
    expect(addPointDefaults("2026-10-07")).toEqual({
      startedAt: "2026-10-07T08:00:00Z",
      endedAt: "2026-10-07T12:00:00Z",
    });
    expect(launchDefaults("2026-10-06T06:00:00+00:00", "2027-12-31T10:30:00+00:00")).toEqual({
      startedAt: "2026-10-06T06:00:00+00:00",
      endedAt: "2026-10-06T10:30:00Z",
    });
    expect(launchDefaults("2026-10-06T06:00:00Z", "2026-10-06T09:00:00Z").endedAt).toBe(
      "2026-10-06T09:00:00Z",
    );
    expect(launchDefaults(null, null)).toEqual({ startedAt: null, endedAt: null });
  });

  test("componente: ações de ponto só para o gestor com a folha aberta; contabilidade só decide", () => {
    const c = readFileSync(
      new URL("../src/components/ponto/TimesheetClosingTable.tsx", import.meta.url),
      "utf8",
    );
    expect(c).toMatch(/const canPunch = canEdit && !locked;/);
    expect(c).toMatch(/if \(\(a === "edit" \|\| a === "launch"\) && !canPunch\) continue;/);
    expect(c).toMatch(/Adicionar ponto/);
    expect(c).toMatch(/\{canPunch && editor && \(/);
    expect(c).toMatch(/regularizeTaskAbsence=\{editor\.mode === "create" && editor\.regularize\}/);
    expect(c).toMatch(/md:hidden/);
    expect(c).toMatch(/queryKey: \["timesheet-closing"\]/);
    for (const h of [
      "Data",
      "Cliente",
      "Previsto",
      "Entrada",
      "Saída",
      "Pausas",
      "Total",
      "Diferença",
      "Situação",
      "Ação",
    ])
      expect(c).toContain(`>${h}</th>`);
  });

  test("Gestão: Lançar ponto também corrige o fim nas recorrências", () => {
    const g = readFileSync(new URL("../src/routes/app.ponto_.gestao.tsx", import.meta.url), "utf8");
    expect(g).toMatch(/launchDefaults\(row\.scheduled_for, row\.scheduled_end\)/);
  });
});
