import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const form = readFileSync(
  new URL("../src/components/tasks/page/task-form.tsx", import.meta.url),
  "utf8",
);

describe("SUP-2026-000239: pré-selecionados sempre visíveis na Nova tarefa", () => {
  test("a pesquisa nunca esconde quem já está selecionado", () => {
    expect(form).toContain("if (assignees.includes(m.id)) return true;");
    // e os selecionados continuam no topo da lista
    expect(form).toContain("const sa = assignees.includes(a.id) ? 0 : 1;");
  });

  test("faixa 'Selecionados (N)' com remover e limpar, acima da lista", () => {
    expect(form).toContain('aria-label="Funcionários selecionados"');
    expect(form).toContain("Selecionados ({assignees.length}) · cada um recebe a sua tarefa");
    expect(form.indexOf('aria-label="Funcionários selecionados"')).toBeLessThan(
      form.indexOf("filteredAssignees.map((m) =>"),
    );
  });

  test("o botão diz quantas tarefas vai criar", () => {
    expect(form).toContain("`Criar ${assignees.length} tarefas (uma por funcionário)`");
  });
});
