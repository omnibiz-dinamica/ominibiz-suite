import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { findUndoSnapshot, type SeriesUndoSnapshot } from "../src/lib/tasks/series-undo";

const now = Date.parse("2026-11-22T19:00:00Z");
const snap = (o: Partial<SeriesUndoSnapshot>): SeriesUndoSnapshot => ({
  id: "s1",
  recurrence_id: "r1",
  created_at: "2026-11-22T18:15:02.300Z",
  expires_at: "2026-11-23T18:15:02Z",
  undone_at: null,
  ...o,
});
const ev = { action: "series_edited", entity_id: "r1", created_at: "2026-11-22T18:15:02.419Z" };

describe("Desfazer edição de série (24 h)", () => {
  test("encontra a cópia da mesma edição", () => {
    expect(findUndoSnapshot(ev, [snap({})], now)?.id).toBe("s1");
  });
  test("sem botão: outra série, já desfeita, expirada, longe no tempo ou outra ação", () => {
    expect(findUndoSnapshot(ev, [snap({ recurrence_id: "r2" })], now)).toBeNull();
    expect(findUndoSnapshot(ev, [snap({ undone_at: "2026-11-22T18:20:00Z" })], now)).toBeNull();
    expect(findUndoSnapshot(ev, [snap({ expires_at: "2026-11-22T18:59:00Z" })], now)).toBeNull();
    expect(findUndoSnapshot(ev, [snap({ created_at: "2026-11-22T17:00:00Z" })], now)).toBeNull();
    expect(findUndoSnapshot({ ...ev, action: "task_deleted_bulk" }, [snap({})], now)).toBeNull();
  });
  test("duas edições seguidas: cada linha fica com a sua cópia", () => {
    const a = snap({ id: "a", created_at: "2026-11-22T18:15:00Z" });
    const b = snap({ id: "b", created_at: "2026-11-22T18:15:08Z" });
    expect(findUndoSnapshot({ ...ev, created_at: "2026-11-22T18:15:08.1Z" }, [a, b], now)?.id).toBe("b");
  });
  test("SQL: cópia antes de apagar, validações no servidor e guarda PARAR", () => {
    const sql = readFileSync("docs/sql/desfazer_edicao_serie_20261122_aplicar.sql", "utf8");
    expect(sql).toContain("PARAR: este script já foi aplicado");
    expect(sql.indexOf("INTO v_del")).toBeLessThan(sql.indexOf("DELETE FROM public.tasks t"));
    expect(sql).toContain("Apenas a gestão pode desfazer");
    expect(sql).toContain("Esta alteração já foi desfeita");
    expect(sql).toContain("Já passaram 24 horas");
    expect(sql).toContain("A série foi alterada depois desta edição");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    const ui = readFileSync("src/components/dashboards/ActivityTimeline.tsx", "utf8");
    expect(ui).toContain('data-testid="activity-undo-series"');
  });
});
