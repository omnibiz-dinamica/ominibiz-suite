import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  numberGroups,
  sectorGroups,
  teamGroups,
  teamKey,
  teamNumberLabel,
  toggleTeam,
} from "../src/lib/teams";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("ticket 172: setor e número da equipa", () => {
  test("setores agrupam sem diferenciar maiúsculas, acentos e espaços", () => {
    expect(teamKey(" coifas ")).toBe("COIFAS");
    expect(teamKey("Vários")).toBe("VARIOS");
    const g = sectorGroups([
      { id: "a", sector: "COIFAS" },
      { id: "b", sector: "coifas" },
      { id: "c", sector: "HAPPYKOTS" },
      { id: "d", sector: null },
    ]);
    expect(g.map((t) => [t.key, t.name, t.ids])).toEqual([
      ["s:COIFAS", "COIFAS", ["a", "b"]],
      ["s:HAPPYKOTS", "HAPPYKOTS", ["c"]],
    ]);
  });

  test("equipas por número, em ordem numérica", () => {
    expect(teamNumberLabel(6)).toBe("Equipa 6");
    expect(teamNumberLabel(null)).toBeNull();
    const g = numberGroups([
      { id: "a", team_number: 10 },
      { id: "b", team_number: 2 },
      { id: "c", team_number: 2 },
      { id: "d", team_number: null },
    ]);
    expect(g.map((t) => [t.key, t.name, t.ids])).toEqual([
      ["n:2", "Equipa 2", ["b", "c"]],
      ["n:10", "Equipa 10", ["a"]],
    ]);
  });

  test("a mesma pessoa aparece no setor e na equipa", () => {
    const g = teamGroups([{ id: "a", sector: "COIFAS", team_number: 6 }]);
    expect(g.map((t) => [t.kind, t.name])).toEqual([
      ["sector", "COIFAS"],
      ["number", "Equipa 6"],
    ]);
  });

  test("selecionar o grupo marca todos; carregar de novo tira-os; mantém os outros", () => {
    const team = { key: "s:COIFAS", name: "COIFAS", kind: "sector" as const, ids: ["a", "b"] };
    expect(toggleTeam(["x"], team)).toEqual(["x", "a", "b"]);
    expect(toggleTeam(["x", "a", "b"], team)).toEqual(["x"]);
    expect(toggleTeam(["a"], team).sort()).toEqual(["a", "b"]);
  });

  test("atalhos e pesquisa nas Tarefas, Nova tarefa, Ponto · Gestão e Fechamento", () => {
    const picker = read("../src/components/common/EmployeePicker.tsx");
    expect(picker).toContain("<TeamChips");
    expect(picker).toContain("teamNumberLabel(e.team_number)");
    const form = read("../src/components/tasks/page/task-form.tsx");
    expect(form).toContain("<TeamChips");
    expect(form).toContain("teamNumberLabel");
    const chips = read("../src/components/common/TeamChips.tsx");
    expect(chips).toContain('label="Setores"');
    expect(chips).toContain('label="Equipas"');
    const g = read("../src/routes/app.ponto_.gestao.tsx");
    expect(g).toContain('aria-label="Filtrar por equipa"');
    expect(g).toContain("Setor / equipa");
    expect(g).toContain(
      "const rows = teamSet ? fetched.filter((r) => teamSet.has(r.user_id)) : fetched;",
    );
    const f = read("../src/routes/app.ponto_.fechamento.tsx");
    expect(f).toContain("(!teamSet || teamSet.has(r.employee_id))");
    expect(f).toContain("Setor / equipa");
    const e = read("../src/components/equipe/EmployeeEditor.tsx");
    expect(e).toContain('<Field label="Equipa (nº, opcional)">');
    expect(e).toContain('<Field label="Setor (ex.: COIFAS, HAPPYKOTS)">');
  });
});
