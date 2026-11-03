import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

const calls: Array<[string, Record<string, unknown>]> = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      if (args._reason === "falha")
        return { data: null, error: { message: "Não é possível alterar o cliente" } };
      return { data: { task_id: "t", old_client: "A", new_client: "B", entries: 2 }, error: null };
    },
  },
}));

const { changeTaskClient } = await import("../src/components/ponto/ChangeTaskClient");

test("mudar cliente chama a RPC do banco com ponto, cliente e motivo", async () => {
  const res = await changeTaskClient("e1", "c2", "Cliente errado");
  expect(calls[0]).toEqual([
    "punch_admin_change_task_client",
    { _time_entry_id: "e1", _client_id: "c2", _reason: "Cliente errado" },
  ]);
  expect(res.new_client).toBe("B");
});

test("erro do banco (folha assinada, sem permissão) chega ao gestor", async () => {
  await expect(changeTaskClient("e1", "c2", "falha")).rejects.toThrow(
    "Não é possível alterar o cliente",
  );
});

test("editor do ponto mostra 'Mudar cliente' só em pontos com tarefa", () => {
  const drawer = readFileSync(
    new URL("../src/components/ponto/PunchEditorDrawer.tsx", import.meta.url),
    "utf8",
  );
  expect(drawer).toMatch(
    /entry\.task_id \? \(\s*<ChangeTaskClient\s+entryId=\{entry\.id\}\s+companyId=\{companyId\}\s+clientName=\{entryClientName\}\s+\/>/,
  );
});
