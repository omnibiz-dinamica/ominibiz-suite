import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

const calls: Array<[string, Record<string, unknown>]> = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      if (args._decision === "ignored" && args._task_id === null) {
        return { data: null, error: { message: "Sem horário previsto: use Validar ou Alterar." } };
      }
      return {
        data: name === "timesheet_reconciliation_list" ? [] : { status: "validated" },
        error: null,
      };
    },
  },
}));

const lib = await import("../src/lib/ponto/reconciliation");
type Row = import("../src/lib/ponto/reconciliation").ReconciliationRow;

const base: Row = {
  row_key: "task:1",
  kind: "task",
  work_date: "2026-11-03",
  task_id: "t1",
  time_entry_id: "e1",
  task_title: "Limpeza",
  task_status: "concluido",
  client_name: "Cliente A",
  planned_start: "07:00",
  planned_end: "09:00",
  planned_minutes: 120,
  scheduled_for: "2026-11-03T07:00:00+00:00",
  scheduled_end: "2026-11-03T09:00:00+00:00",
  real_start: "07:00",
  real_end: "10:00",
  real_minutes: 180,
  entries_count: 1,
  diff_minutes: 60,
  counted_minutes: 180,
  status: "pendente",
  decision: null,
  decision_stale: false,
  decided_by_name: null,
  decided_at: null,
  notes: null,
  period_status: null,
  period_locked: false,
  actions: ["validate", "ignore", "edit"],
};

test("diferença como na folha da gestora: +1:00, -2:00, 0:00", () => {
  expect(lib.formatDiff(60)).toBe("+1:00");
  expect(lib.formatDiff(-120)).toBe("-2:00");
  expect(lib.formatDiff(0)).toBe("0:00");
  expect(lib.formatDiff(null)).toBe("—");
  expect(lib.formatHours(135)).toBe("2:15");
});

test("totais: previsto, real, contado, saldo, por conferir e dias sem ponto", () => {
  const rows: Row[] = [
    {
      ...base,
      row_key: "a",
      status: "ok",
      planned_minutes: 120,
      real_minutes: 120,
      counted_minutes: 120,
      diff_minutes: 0,
    },
    { ...base, row_key: "b" },
    {
      ...base,
      row_key: "c",
      kind: "unplanned",
      task_id: null,
      planned_minutes: null,
      real_minutes: 120,
      counted_minutes: 120,
      diff_minutes: 120,
    },
    {
      ...base,
      row_key: "d",
      kind: "missing",
      real_minutes: 0,
      counted_minutes: 0,
      diff_minutes: -120,
      entries_count: 0,
    },
  ];
  const s = lib.summarizeReconciliation(rows);
  expect(s.plannedMinutes).toBe(360);
  expect(s.realMinutes).toBe(420);
  expect(s.balanceMinutes).toBe(60);
  expect(s.countedMinutes).toBe(420);
  expect(s.pending).toBe(3);
  expect(s.missing).toBe(1);
});

test("situação: ignorar falta = ciente 0h; ignorar diferença = conta o previsto", () => {
  expect(lib.statusLabel({ status: "ignored", kind: "missing" })).toBe("Ciente · conta 0h");
  expect(lib.statusLabel({ status: "ignored", kind: "task" })).toBe("Ignorado · conta o previsto");
  expect(lib.statusLabel({ status: "validated", kind: "task" })).toBe("Validado · conta o real");
  expect(lib.statusLabel({ status: "ok", kind: "task" })).toBe("Sem diferença");
  expect(lib.ignoreConfirmText(base)).toContain("contar o previsto (2:00)");
  expect(lib.ignoreConfirmText({ ...base, kind: "missing" })).toContain("conta 0 h");
});

test("mês: primeiro e último dia (incl. fevereiro)", () => {
  expect(lib.monthRange(2026, 11)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  expect(lib.monthRange(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
});

test("decidir: linha de tarefa vai pela tarefa; ponto sem tarefa vai pelo ponto", async () => {
  calls.length = 0;
  await lib.decideReconciliation({
    companyId: "c",
    employeeId: "u",
    row: base,
    decision: "ignored",
    notes: "  combinado ",
  });
  expect(calls[0][0]).toBe("timesheet_reconciliation_decide");
  expect(calls[0][1]).toMatchObject({
    _task_id: "t1",
    _time_entry_id: null,
    _decision: "ignored",
    _notes: "combinado",
  });
  await lib.decideReconciliation({
    companyId: "c",
    employeeId: "u",
    row: { task_id: null, time_entry_id: "e9" },
    decision: "validated",
  });
  expect(calls[1][1]).toMatchObject({ _task_id: null, _time_entry_id: "e9", _notes: null });
});

test("erro do banco chega à tela (ex.: ignorar sem previsto)", async () => {
  await expect(
    lib.decideReconciliation({
      companyId: "c",
      employeeId: "u",
      row: { task_id: null, time_entry_id: "e9" },
      decision: "ignored",
    }),
  ).rejects.toMatchObject({ message: expect.stringContaining("Sem horário previsto") });
});

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("Gestão: aba Conferência com funcionário e período; Alterar e Lançar ponto", () => {
  const g = read("../src/routes/app.ponto_.gestao.tsx");
  expect(g).toMatch(/\["conferencia", "Conferência Previsto x Real"\]/);
  expect(g).toMatch(/<ScheduleReconciliation/);
  expect(g).toMatch(/onEdit=\{\(row\) => void openConfEdit\(row\)\}/);
  expect(g).toMatch(/onLaunch=\{openConfLaunch\}/);
  // os lançamentos continuam lá (só escondidos na conferência)
  expect(g).toMatch(/view === "lancamentos" \? "space-y-5" : "hidden"/);
});

test("Fechamento e Contabilidade: folha e conferência numa só tabela; Alterar só com canEdit", () => {
  const d = read("../src/components/ponto/TimesheetViewerDialog.tsx");
  expect(d).not.toMatch(/\["conferencia", "Conferência Previsto x Real"\]/);
  expect(d).not.toMatch(/<TimesheetDaysTable/);
  expect(d).toMatch(/<TimesheetClosingTable/);
  expect(d).toMatch(/canEdit=\{canEdit\}/);
  expect(d).toMatch(/locked=\{isClosingLocked\(viewRow \?\? row\)\}/);
  const c = read("../src/routes/app.contabilidade.folhas-ponto.tsx");
  expect(c).toMatch(/<TimesheetViewerDialog/);
  expect(c).not.toMatch(/canEdit/);
});

test("componente: sem funcionário pede escolha; Ignorar pede confirmação; telemóvel em cartões", () => {
  const s = read("../src/components/ponto/ScheduleReconciliation.tsx");
  expect(s).toMatch(/Escolha um funcionário/);
  expect(s).toMatch(/<AlertDialog open=\{!!confirmIgnore\}/);
  expect(s).toMatch(/md:hidden/);
  expect(s).toMatch(/hidden overflow-x-auto rounded-2xl border border-border bg-card md:block/);
  expect(s).toMatch(/Tentar de novo/);
});
