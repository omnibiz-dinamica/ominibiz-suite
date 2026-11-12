import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { teamGroups, teamKey, toggleTeam } from "../src/lib/teams";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("ticket 172: equipas pelo Setor do cadastro", () => {
  test("agrupa sem diferenciar maiúsculas, acentos e espaços", () => {
    expect(teamKey(" coifas ")).toBe("COIFAS");
    expect(teamKey("Vários")).toBe("VARIOS");
    const g = teamGroups([
      { id: "a", sector: "COIFAS" },
      { id: "b", sector: "coifas" },
      { id: "c", sector: "HAPPYKOTS" },
      { id: "d", sector: null },
    ]);
    expect(g.map((t) => [t.name, t.ids])).toEqual([
      ["COIFAS", ["a", "b"]],
      ["HAPPYKOTS", ["c"]],
    ]);
  });

  test("selecionar a equipa marca todos; carregar de novo tira-os; mantém os outros", () => {
    const team = { key: "COIFAS", name: "COIFAS", ids: ["a", "b"] };
    expect(toggleTeam(["x"], team)).toEqual(["x", "a", "b"]);
    expect(toggleTeam(["x", "a", "b"], team)).toEqual(["x"]);
    expect(toggleTeam(["a"], team).sort()).toEqual(["a", "b"]);
  });

  test("atalhos nas Tarefas, Nova tarefa, Ponto · Gestão e Fechamento", () => {
    expect(read("../src/components/common/EmployeePicker.tsx")).toContain("<TeamChips");
    expect(read("../src/components/tasks/page/task-form.tsx")).toContain("<TeamChips");
    const g = read("../src/routes/app.ponto_.gestao.tsx");
    expect(g).toContain('aria-label="Filtrar por equipa"');
    expect(g).toContain(
      "const rows = teamSet ? fetched.filter((r) => teamSet.has(r.user_id)) : fetched;",
    );
    const f = read("../src/routes/app.ponto_.fechamento.tsx");
    expect(f).toContain("(!teamSet || teamSet.has(r.employee_id))");
    const e = read("../src/components/equipe/EmployeeEditor.tsx");
    expect(e).toContain('<Field label="Equipa (ex.: COIFAS, HAPPYKOTS)">');
    expect(e).not.toContain('<Field label="Equipa (1–10, opcional)">');
  });
});
