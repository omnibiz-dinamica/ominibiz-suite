import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const form = readFileSync("src/components/tasks/page/task-form.tsx", "utf8");
const page = readFileSync("src/routes/app.tarefas.tsx", "utf8");

test("22/11: editar tarefa tem 'Copiar tarefa' que abre nova tarefa com os mesmos dados", () => {
  expect(form).toContain('data-testid="task-copy"');
  // Cópia nunca começa como recorrência e mantém o horário digitado.
  expect(form).toContain("recurrence: { ...recurrence, enabled: false },");
  expect(form).toContain("manualEndOverride: true,");
  expect(page).toContain("onCopy={(values) => {");
  expect(page).toContain("copyOf={copySource?.origin ?? null}");
  expect(page).toContain("draftValues={copySource ? copySource.values : taskDraft.restored}");
});

test("cópia não pode ficar no mesmo dia e hora da original (sem recorrência)", () => {
  expect(form).toMatch(/copyOf &&\s+!recurrence\.enabled &&\s+startDate === copyOf\.startDate &&\s+startTime === copyOf\.startTime/);
});
