import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { matchesClosingSearch } from "../src/lib/ponto/closing-search";

const andre = { employee_name: "André Bonin Olandini", employee_email: "andre@exemplo.pt" };

describe("pesquisa do Fechamento Mensal", () => {
  test("nome sem acento, maiúsculas, partes do nome e e-mail", () => {
    expect(matchesClosingSearch(andre, "")).toBe(true);
    expect(matchesClosingSearch(andre, "andre")).toBe(true);
    expect(matchesClosingSearch(andre, "ANDRÉ olandini")).toBe(true);
    expect(matchesClosingSearch(andre, "exemplo.pt")).toBe(true);
    expect(matchesClosingSearch(andre, "bruno")).toBe(false);
    expect(matchesClosingSearch({ employee_name: null, employee_email: null }, "x")).toBe(false);
  });

  test("a tela filtra a lista (e as ações em lote) pela pesquisa", () => {
    const p = readFileSync(
      new URL("../src/routes/app.ponto_.fechamento.tsx", import.meta.url),
      "utf8",
    );
    expect(p).toContain("matchesClosingSearch(r, search)");
    expect(p).toContain('placeholder="Nome ou e-mail do funcionário"');
    // pesquisar limpa a seleção; "selecionar todos" só conta as linhas visíveis
    expect(p).toMatch(/setSearch\(e\.target\.value\);[\s\S]{0,120}setSelected\(\[\]\);/);
    expect(p).toContain("rows.every((r) => selected.includes(r.period_id))");
  });
});
