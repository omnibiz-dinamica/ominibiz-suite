import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { localTodayKey, managerUpcomingFilter } from "../src/lib/punch/manager-queue";

// SUP-2026-000092 — tarefas antigas não podem ficar para sempre no Ponto do gestor.
test("a fila do gestor só aceita em andamento ou de hoje em diante", () => {
  const now = new Date(2026, 9, 29, 17, 5); // 29/10/2026 17:05 local
  expect(localTodayKey(now)).toBe("2026-10-29");
  expect(managerUpcomingFilter(now)).toBe(
    "status.eq.em_andamento," +
      "scheduled_for.gte.2026-10-29T00:00:00.000Z," +
      "and(scheduled_for.is.null,recurrence_date.gte.2026-10-29)," +
      "and(scheduled_for.is.null,recurrence_date.is.null,due_at.gte.2026-10-29T00:00:00.000Z)",
  );
});

test("o filtro aplica-se só ao gestor e mantém arquivadas/excluídas fora", () => {
  const src = readFileSync(new URL("../src/routes/app.ponto.tsx", import.meta.url), "utf8");
  expect(src).toMatch(
    /if \(isManager \|\| isSuperAdmin\) \{\n\s+if \(currentCompanyId\) q = q\.eq\("company_id", currentCompanyId\);\n(\s+\/\/.*\n)+\s+q = q\.or\(managerUpcomingFilter\(\)\);\n\s+\} else \{\n\s+q = q\.eq\("assigned_to", user\.id\);/,
  );
  expect(src).toMatch(/\.is\("archived_at", null\)/);
  expect(src).toMatch(/\.is\("deleted_at", null\)/);
});
