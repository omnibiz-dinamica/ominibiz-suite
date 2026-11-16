import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/components/tasks/page/task-form.tsx", import.meta.url), "utf8");

test("16/11/2026: escolha do cliente na Nova tarefa é inline (telemóvel/tablet: teclado abre e a lista não some)", () => {
  // sem Select com pesquisa dentro (fechava no toque e prendia o foco no modal)
  expect(form).not.toContain("onValueChange={(v) => void applyClient(v)}");
  expect(form).toContain('data-testid="task-client-trigger"');
  expect(form).toContain('id="task-client-list"');
  // pesquisa recebe o foco ao abrir e escolher fecha a lista
  expect(form).toMatch(/autoFocus\s+type="search"/);
  expect(form).toContain("void applyClient(c.id);");
  // alvo de toque confortável no telemóvel
  expect(form).toContain("min-h-11");
});
