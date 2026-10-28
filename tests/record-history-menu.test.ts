import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { historyRefsFilter } from "../src/components/history/RecordHistoryMenu";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const menu = read("../src/components/history/RecordHistoryMenu.tsx");

// SUP-2026-000312 — "quem e quando" com o botão direito em todo o programa.
test("o filtro só usa ids válidos e junta registos relacionados (ex.: série da tarefa)", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const serie = "22222222-2222-4222-8222-222222222222";
  expect(
    historyRefsFilter([
      { type: "task", id },
      { type: "recurrence", id: serie },
      { type: "recurrence", id: null },
      { type: "client", id: "x),or(1.eq.1" },
    ]),
  ).toBe(
    `and(entity_type.eq.task,entity_id.eq.${id}),and(entity_type.eq.recurrence,entity_id.eq.${serie})`,
  );
  expect(historyRefsFilter([{ type: "task", id: null }])).toBeNull();
});

test("só gestores veem o menu e a consulta fica na empresa ativa", () => {
  expect(menu).toMatch(
    /if \(!isManager \|\| !currentCompanyId \|\| !entityId\) return <>\{children\}<\/>;/,
  );
  expect(menu).toMatch(/\.eq\("company_id", companyId\)/);
  expect(menu).toMatch(/Ver histórico \(quem e quando\)/);
});

test("o menu está nas tarefas, clientes, despesas, férias, equipa e ponto", () => {
  const uses: [string, RegExp][] = [
    ["../src/routes/app.tarefas.tsx", /<RecordHistoryMenu entityType="task"/g],
    ["../src/routes/app.clientes.tsx", /<RecordHistoryMenu key=\{c\.id\} entityType="client"/],
    ["../src/routes/app.despesas.tsx", /entityType="expense"/],
    ["../src/routes/app.ferias.tsx", /entityType="vacation"/],
    ["../src/routes/app.equipe.tsx", /entityType="employee"/],
    [
      "../src/routes/app.ponto_.gestao.tsx",
      /entityType=\{isVacation\(r\) \? "vacation" : "punch"\}/,
    ],
  ];
  for (const [path, re] of uses) expect(read(path)).toMatch(re);
  expect(
    (read("../src/routes/app.tarefas.tsx").match(/<RecordHistoryMenu entityType="task"/g) ?? [])
      .length,
  ).toBe(3);
});
