import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ACTION_LABEL,
  correctionContext,
  shiftText,
  statusLabel,
  type ReconciliationRow,
} from "../src/lib/ponto/reconciliation";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const row = (p: Partial<ReconciliationRow>): ReconciliationRow =>
  ({
    row_key: "task:1",
    kind: "task",
    work_date: "2026-11-03",
    task_id: "1",
    time_entry_id: "e1",
    task_title: "Limpeza",
    task_status: "concluido",
    client_name: "Defense Peutie",
    planned_start: "08:00",
    planned_end: "12:00",
    planned_minutes: 240,
    scheduled_for: null,
    scheduled_end: null,
    real_start: "07:40",
    real_end: "11:40",
    real_minutes: 240,
    entries_count: 1,
    diff_minutes: 0,
    counted_minutes: 240,
    status: "pendente",
    decision: null,
    decision_stale: false,
    decided_by_name: null,
    decided_at: null,
    notes: null,
    period_status: null,
    period_locked: false,
    actions: ["validate", "ignore", "edit"],
    ...p,
  }) as ReconciliationRow;

describe("SUP-2026-000299: conferência para pagamento", () => {
  test("desvios de 15 min ou mais na entrada/saída aparecem em texto (vermelho)", () => {
    expect(shiftText({ start_shift_minutes: -20, end_shift_minutes: -20 })).toBe(
      "Entrada 20 min antes · saída 20 min antes",
    );
    expect(shiftText({ start_shift_minutes: 5, end_shift_minutes: 75 })).toBe("Saída 1h15 depois");
    expect(shiftText({ start_shift_minutes: 14, end_shift_minutes: -14 })).toBeNull();
  });

  test("dentro da tolerância (≤30 min) aparece como tal; Corrigir em vez de Alterar", () => {
    expect(statusLabel({ status: "ok", kind: "task", diff_minutes: 9 })).toBe(
      "Dentro da tolerância",
    );
    expect(statusLabel({ status: "ok", kind: "task", diff_minutes: 0 })).toBe("Sem diferença");
    expect(ACTION_LABEL.edit).toBe("Corrigir");
  });

  test("Corrigir leva o previsto, o desvio e a observação do funcionário para o editor", () => {
    const ctx = correctionContext(
      row({
        start_shift_minutes: -20,
        end_shift_minutes: -20,
        employee_note: " Esqueci de picar ",
      }),
    );
    expect(ctx).toEqual({
      planned: "08:00–12:00",
      plannedMinutes: 240,
      shift: "Entrada 20 min antes · saída 20 min antes",
      employeeNote: "Esqueci de picar",
    });
    expect(read("../src/components/ponto/PunchEditorDrawer.tsx")).toContain(
      'data-testid="punch-review-context"',
    );
    expect(read("../src/routes/app.ponto_.gestao.tsx")).toContain(
      "setReviewContext(correctionContext(row));",
    );
    expect(read("../src/components/ponto/TimesheetClosingTable.tsx")).toContain(
      "review: correctionContext(r),",
    );
  });

  test("o SQL: >30 min, horário a 15 min ou observação pedem decisão; decisões feitas não mudam", () => {
    const sql = read("../docs/sql/conferencia_alertas_20261115_aplicar.sql");
    expect(sql).toContain("AND abs(x.real_min - x.plan_min) <= 30");
    expect(sql).toContain(
      "abs(COALESCE(x.start_shift, 0)) < 15 AND abs(COALESCE(x.end_shift, 0)) < 15",
    );
    expect(sql).toContain("AND x.employee_note IS NULL AND x.decision IS NULL THEN 'ok'");
    expect(sql).toContain(
      "RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.'",
    );
  });
});
