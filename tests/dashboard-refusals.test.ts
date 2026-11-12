import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dayRangeInTz, isRefusedOn, refusalDayKey, todayInTz } from "../src/lib/tasks/refusals";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const TZ = "Europe/Brussels";
const refused = (refused_at: string, extra: Record<string, unknown> = {}) => ({
  status: "cancelado",
  refused_by: "u1",
  refused_at,
  archived_at: null,
  deleted_at: null,
  ...extra,
});

describe("SUP-2026-000174: Recusadas = recusas feitas hoje", () => {
  test("o dia é o da recusa no fuso da empresa, não o dia da tarefa", () => {
    // 23:30 UTC de 11/11 já é 12/11 em Bruxelas (UTC+1).
    expect(refusalDayKey({ refused_at: "2026-11-11T23:30:00Z" }, TZ)).toBe("2026-11-12");
    expect(isRefusedOn(refused("2026-11-12T08:00:00Z"), "2026-11-12", TZ)).toBe(true);
    expect(isRefusedOn(refused("2026-11-11T08:00:00Z"), "2026-11-12", TZ)).toBe(false);
  });

  test("reatribuída/concluída, cancelada sem recusa, arquivada ou apagada não conta", () => {
    const at = "2026-11-12T08:00:00Z";
    expect(isRefusedOn(refused(at, { status: "concluido" }), "2026-11-12", TZ)).toBe(false);
    expect(isRefusedOn(refused(at, { refused_by: null }), "2026-11-12", TZ)).toBe(false);
    expect(isRefusedOn(refused(at, { archived_at: at }), "2026-11-12", TZ)).toBe(false);
    expect(isRefusedOn(refused(at, { deleted_at: at }), "2026-11-12", TZ)).toBe(false);
  });

  test("intervalo do dia em UTC, também na mudança de hora", () => {
    expect(dayRangeInTz("2026-11-12", TZ)).toEqual({
      from: "2026-11-11T23:00:00.000Z",
      to: "2026-11-12T23:00:00.000Z",
    });
    expect(dayRangeInTz("2026-10-25", TZ)).toEqual({
      from: "2026-10-24T22:00:00.000Z",
      to: "2026-10-25T23:00:00.000Z",
    });
    expect(todayInTz(TZ, new Date("2026-11-11T23:30:00Z"))).toBe("2026-11-12");
  });

  test("Dashboard mostra só Recusadas e abre a lista pelo dia da recusa", () => {
    const d = read("../src/routes/app.index.tsx");
    expect(d).not.toContain('t("Canceladas/Recusadas")');
    expect(d).toContain('{ label: t("Recusadas"), value: refusedToday');
    expect(d).toContain('.gte("refused_at", from)');
    expect(d).toContain("{ status: c.status, refused: refusalDay }");
    const l = read("../src/routes/app.tarefas.tsx");
    expect(l).toContain(
      "if (search.refused && !isRefusedOn(t, search.refused, companyTz)) return false;",
    );
  });
});
