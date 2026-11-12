import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tasksPageSource } from "./helpers/tasks-page-source";

const picker = readFileSync(
  new URL("../src/components/common/EmployeePicker.tsx", import.meta.url),
  "utf8",
);
const tasks = tasksPageSource();

// SUP-2026-000305 — pesquisa de funcionários nas tarefas também pelo setor (ex.: Coifas, Tobaco).
test("o seletor de funcionários pesquisa e mostra o setor", () => {
  expect(picker).toMatch(/sector\?: string \| null;/);
  expect((picker.match(/normalize\(e\.sector\)/g) ?? []).length).toBe(2);
  // Ticket 172: a linha secundária ganhou o número da equipa entre o setor e a equipe.
  expect(
    (picker.match(/\[e\.job_title, e\.sector, teamNumberLabel\(e\.team_number\), e\.team, e\.email\]/g) ?? [])
      .length,
  ).toBe(2);
  expect(picker).toMatch(/Buscar por nome, cargo, setor, equipe…/);
});

test("tarefas: filtro e formulário recebem o setor, sem quebrar se a consulta falhar", () => {
  expect(tasks).toMatch(/queryKey: \["members-sectors", currentCompanyId, memberIdsKey\]/);
  expect(tasks).toMatch(/sector: memberSectors\?\.\[m\.id\] \?\? null/);
  expect(tasks).toMatch(/members=\{withMemberDetails\(activeMembers \?\? \[\]\)\}/);
  // Ticket 172: o número da equipa também entra na pesquisa do formulário.
  expect(tasks).toMatch(/const details = \[m\.sector, m\.job_title, teamNumberLabel\(m\.team_number\)\]/);
  // a projeção canónica dos nomes continua igual
  expect(tasks).toMatch(/select\("id, full_name, job_title"\)/);
});
