import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { canMarkAbsent } from "../src/lib/tasks";

const future = {
  status: "pendente" as const,
  assigned_to: "renata",
  scheduled_for: "2099-01-01T08:00:00.000Z",
  recurrence_date: null,
  due_at: null,
};

describe("SUP-2026-000294: o gestor marca a falta quando souber", () => {
  test("gestor pode marcar antes do início; o funcionário continua com a regra antiga", () => {
    expect(canMarkAbsent(future, { isManager: true })).toBe(true);
    expect(canMarkAbsent(future, { isManager: false, userId: "renata" })).toBe(false);
  });

  test("só pendente ou autorizada; sem responsável não", () => {
    expect(canMarkAbsent({ ...future, status: "em_andamento" as never }, { isManager: true })).toBe(
      false,
    );
    expect(canMarkAbsent({ ...future, assigned_to: null }, { isManager: true })).toBe(false);
  });

  test("o banco deixa de esperar 1h (ou o dia seguinte), mantém só gestor, e tem desfazer", () => {
    const sql = readFileSync(
      new URL("../docs/sql/falta_gestor_20261115_aplicar.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain(
      "RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.'",
    );
    expect(sql).toContain("'continua_so_gestor'");
    const ponto = readFileSync(new URL("../src/routes/app.ponto.tsx", import.meta.url), "utf8");
    expect(ponto).toContain("canMarkAbsent && (isManager || canBecomeAbsent(t))");
  });
});
