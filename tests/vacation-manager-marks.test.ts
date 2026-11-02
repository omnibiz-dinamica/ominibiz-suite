import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// SUP-2026-000314 — o gestor marca férias sem confirmação do funcionário.
test("formulário do gestor: férias ficam aprovadas e o colaborador é notificado", () => {
  const page = read("../src/routes/app.ferias.tsx");
  expect(page).toMatch(/Marcar férias a um colaborador/);
  expect(page).toMatch(/As férias ficam aprovadas de imediato/);
  expect(page).toMatch(/Férias marcadas e aprovadas — o colaborador foi notificado/);
  expect(page).not.toMatch(/Agendar — pendente de confirmação/);
});

test("e-mail informativo, sem pedir confirmação", () => {
  const email = read("../src/lib/email-templates/vacation-created-by-manager.tsx");
  expect(email).toMatch(/subject: 'Férias marcadas pelo gestor'/);
  expect(email).toMatch(/Não é preciso confirmar/);
  expect(email).not.toMatch(/ação necessária/);
});

test("a notificação tem rótulo próprio", () => {
  expect(read("../src/routes/app.notificacoes.tsx")).toMatch(
    /vacation_created_by_manager: "Férias — marcadas pelo gestor"/,
  );
});
