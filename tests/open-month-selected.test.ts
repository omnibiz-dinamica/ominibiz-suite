import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

const calls: Array<[string, Record<string, unknown>]> = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      return { data: (args._employee_ids as string[] | undefined)?.length ?? 0, error: null };
    },
  },
}));

const { openMonthFor } = await import("../src/lib/timesheet");

test("abrir mês: só com funcionários escolhidos; lista vazia não chega ao banco", async () => {
  await expect(openMonthFor("c", 2026, 11, [])).rejects.toThrow(
    "Selecione ao menos um funcionário.",
  );
  expect(calls.length).toBe(0);
  const n = await openMonthFor("c", 2026, 11, ["u1", "u2"]);
  expect(n).toBe(2);
  expect(calls[0][0]).toBe("timesheet_open_month_for");
  expect(calls[0][1]).toMatchObject({
    _company_id: "c",
    _year: 2026,
    _month: 11,
    _employee_ids: ["u1", "u2"],
  });
});

test("nenhuma tela chama a função antiga que avisava todos", () => {
  const lib = readFileSync(new URL("../src/lib/timesheet.ts", import.meta.url), "utf8");
  expect(lib).not.toMatch(/"timesheet_open_month"/);
  const page = readFileSync(
    new URL("../src/routes/app.ponto_.fechamento.tsx", import.meta.url),
    "utf8",
  );
  expect(page).toMatch(/onClick=\{\(\) => setOpenPicker\(true\)\}/);
  expect(page).toMatch(/<OpenMonthDialog/);
  expect(page).not.toMatch(/open\.mutate\(\)/);
});

test("janela: botão só ativo com escolhidos; quem já tem folha fica bloqueado", () => {
  const d = readFileSync(
    new URL("../src/components/ponto/OpenMonthDialog.tsx", import.meta.url),
    "utf8",
  );
  expect(d).toMatch(/disabled=\{picked\.length === 0 \|\| pending\}/);
  expect(d).toMatch(/disabled=\{!!st\}/);
  expect(d).toMatch(/company_active_member_options/);
  expect(d).toMatch(/Selecionar todos/);
});
