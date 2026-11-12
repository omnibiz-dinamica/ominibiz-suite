import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  filterHistory,
  finishedPauses,
  formatPauseSeconds,
  fromHistoryRpc,
  plannedWindow,
  taskDayKey,
  type HistoryRpcRow,
} from "../src/lib/ponto/history";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const row = (o: Partial<HistoryRpcRow>): HistoryRpcRow => ({
  id: "e1",
  started_at: "2026-10-11T22:07:00Z",
  ended_at: "2026-10-12T01:42:00Z",
  effective_minutes: 215,
  paused_at: null,
  resumed_at: null,
  prior_pause_seconds: null,
  task_id: "t1",
  task_title: "Truckstop",
  client_id: "c1",
  client_name: "Truckstop CM",
  scheduled_for: "2026-10-18T23:30:00Z",
  scheduled_end: "2027-12-31T03:00:00Z",
  recurrence_date: "2026-10-18",
  work_date: "2026-10-18",
  pauses: [],
  ...o,
});

describe("histórico do funcionário", () => {
  test("dia da tarefa, previsto só com a hora (recorrência) e cliente mesmo arquivado", () => {
    const e = fromHistoryRpc(row({}));
    expect(taskDayKey(e)).toBe("2026-10-18");
    expect(plannedWindow(e.tasks)).toBe("23:30–03:00");
    expect(e.client_name).toBe("Truckstop CM");
    expect(fromHistoryRpc(row({ task_id: null })).tasks).toBeNull();
  });

  test("pausas: lista da tabela; pontos antigos usam a última pausa e o total anterior", () => {
    const list = finishedPauses({ paused_at: null, resumed_at: null }, [
      {
        time_entry_id: "e1",
        paused_at: "2026-10-05T09:10:00Z",
        resumed_at: "2026-10-05T09:12:00Z",
      },
      {
        time_entry_id: "e1",
        paused_at: "2026-10-05T08:30:00Z",
        resumed_at: "2026-10-05T08:45:02Z",
      },
      { time_entry_id: "e1", paused_at: "2026-10-05T10:00:00Z", resumed_at: null },
    ]);
    expect(list.map((p) => formatPauseSeconds(p.seconds))).toEqual(["00:15:02", "00:02:00"]);
    const old = finishedPauses(
      {
        paused_at: "2026-10-05T12:00:00Z",
        resumed_at: "2026-10-05T12:30:00Z",
        prior_pause_seconds: 600,
      },
      [],
    );
    expect(old.map((p) => formatPauseSeconds(p.seconds))).toEqual(["00:10:00", "00:30:00"]);
    expect(finishedPauses({ paused_at: null, resumed_at: null }, undefined)).toEqual([]);
  });

  test("filtros por data (dia da tarefa), cliente e texto sem acentos", () => {
    const a = fromHistoryRpc(row({ id: "a" }));
    const b = fromHistoryRpc(
      row({ id: "b", client_id: "c2", client_name: "Café São João", work_date: "2026-10-20" }),
    );
    expect(
      filterHistory([a, b], { from: "2026-10-18", to: "2026-10-18" }).map((e) => e.id),
    ).toEqual(["a"]);
    expect(filterHistory([a, b], { clientId: "c2" }).map((e) => e.id)).toEqual(["b"]);
    expect(filterHistory([a, b], { text: "cafe sao" }).map((e) => e.id)).toEqual(["b"]);
  });

  test("tela, menu do funcionário e função do banco", () => {
    const page = read("../src/routes/app.ponto_.historico.tsx");
    expect(page).toContain('"my_punch_history"');
    expect(page).toContain('type="date"');
    expect(page).toContain("md:hidden");
    const nav = read("../src/lib/navigation.ts");
    expect(nav).toContain(
      '{ to: "/app/ponto/historico", label: "Histórico", icon: History, module: "time_clock" }',
    );
    const sql = read("../docs/sql/historico_ponto_20261112_aplicar.sql");
    expect(sql).toContain("te.user_id = v_uid");
    expect(sql).toContain("SECURITY DEFINER");
  });

  test("Folha de Ponto: pausas ao lado do tempo só depois de retomar; toast sem código", () => {
    const p = read("../src/routes/app.ponto.tsx");
    expect(p).toMatch(/state === "aberto" &&\s+!isLocalEntryId\(entry\.id\)/);
    expect(p).toContain('data-testid="done-pauses"');
    expect(p).toContain('qc.invalidateQueries({ queryKey: ["punch-open-pauses"] })');
    expect(p).toContain("if (res.success) toast.success(msg);");
  });
});
