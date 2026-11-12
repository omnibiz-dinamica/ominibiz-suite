import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  formatInTz,
  inputInTzToIso,
  isValidTimeZone,
  isoToInputInTz,
} from "../src/lib/company-time";
import { fromLocalInput, toLocalInput } from "../src/lib/punch-admin";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("SUP-323: horas de ponto no fuso da empresa", () => {
  test("mesma hora seja qual for o computador: Bruxelas vs Lisboa (verão e inverno)", () => {
    // 06:00 UTC em outubro (verão): Bruxelas 08:00, Lisboa 07:00
    expect(formatInTz("2026-10-05T06:00:00Z", "Europe/Brussels")).toBe("05/10/2026 08:00");
    expect(formatInTz("2026-10-05T06:00:00Z", "Europe/Lisbon", { timeOnly: true })).toBe("07:00");
    // novembro (inverno): Bruxelas UTC+1
    expect(formatInTz("2026-11-12T07:00:00Z", "Europe/Brussels", { timeOnly: true })).toBe("08:00");
  });

  test("editor: o horário digitado é lido no fuso da empresa e volta igual", () => {
    expect(inputInTzToIso("2026-10-05T08:00", "Europe/Brussels")).toBe("2026-10-05T06:00:00.000Z");
    expect(inputInTzToIso("2026-11-12T08:00", "Europe/Brussels")).toBe("2026-11-12T07:00:00.000Z");
    expect(isoToInputInTz("2026-10-05T06:00:00Z", "Europe/Brussels")).toBe("2026-10-05T08:00");
    // dia da mudança de hora (25/10/2026, 03:00 → 02:00 em Bruxelas)
    const iso = inputInTzToIso("2026-10-25T12:00", "Europe/Brussels")!;
    expect(isoToInputInTz(iso, "Europe/Brussels")).toBe("2026-10-25T12:00");
    // punch-admin com fuso usa a mesma regra; sem fuso fica como antes
    expect(toLocalInput("2026-10-05T06:00:00Z", "Europe/Brussels")).toBe("2026-10-05T08:00");
    expect(fromLocalInput("2026-10-05T08:00", "Europe/Brussels")).toBe("2026-10-05T06:00:00.000Z");
    expect(fromLocalInput("")).toBeNull();
  });

  test("fuso inválido é recusado", () => {
    expect(isValidTimeZone("Europe/Brussels")).toBe(true);
    expect(isValidTimeZone("Nada/Isto")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  test("Ponto · Gestão e editor deixam de usar o fuso do computador", () => {
    const g = read("../src/routes/app.ponto_.gestao.tsx");
    expect(g).not.toContain("{new Date(r.started_at).toLocaleString()}");
    expect(g).not.toContain("{new Date(r.ended_at).toLocaleString()}");
    expect(g).toContain("const rowTz = (r: Row) => entryTimeZones?.get(r.id) ?? companyTz;");
    expect(g).toContain(
      '{ header: "Início", accessor: (r) => (isNonWork(r) ? "" : fmtDT(r, r.started_at)) }',
    );
    const d = read("../src/components/ponto/PunchEditorDrawer.tsx");
    expect(d).toMatch(/fromLocalInput\(form\.started_at, tz\)/);
    expect(d).toContain("disabled={pending || !tzReady}");
    const sql = read("../docs/sql/fuso_vclean_bruxelas_20261112_aplicar.sql");
    expect(sql).toContain("SET timezone = 'Europe/Brussels'");
  });
});
