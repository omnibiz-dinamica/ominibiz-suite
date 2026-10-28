import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { detailLines } from "../src/components/dashboards/ActivityTimeline";

const timeline = readFileSync(
  new URL("../src/components/dashboards/ActivityTimeline.tsx", import.meta.url),
  "utf8",
);

// SUP-2026-000312 — criação em lote: cada tarefa (data · tarefa · funcionário) numa linha.
test("listas de tarefas completas aparecem uma por linha; listas simples continuam com vírgulas", () => {
  const [tarefas, dias] = detailLines(
    {
      Tarefas: [
        '29/10/2026 08:30–10:00 · "Faculty Club" · Ana',
        '29/10/2026 08:30–10:00 · "Faculty Club" · Renata',
      ],
      "Dias da semana": ["Seg", "Qua"],
    },
    "pt-PT",
  );
  expect(tarefas).toEqual({
    key: "Tarefas",
    value:
      '29/10/2026 08:30–10:00 · "Faculty Club" · Ana\n29/10/2026 08:30–10:00 · "Faculty Club" · Renata',
  });
  expect(dias).toEqual({ key: "Dias da semana", value: "Seg, Qua" });
  expect(timeline).toMatch(/whitespace-pre-line break-words/);
});
