import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

const calls: Array<[string, Record<string, unknown>]> = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      if (args._reason === "falha")
        return {
          data: null,
          error: {
            message: "Já existe uma tarefa deste funcionário para este cliente a esta hora.",
          },
        };
      return { data: { id: "te1", task_id: "t-nova" }, error: null };
    },
  },
}));

const { NEW_TASK_OPTION, punchAdminCreateWithTask } = await import("../src/lib/punch-admin");

test("ticket 247: ponto com tarefa nova vai numa só chamada ao banco", async () => {
  const r = await punchAdminCreateWithTask(
    {
      user_id: "u1",
      started_at: "2026-11-05T07:00:00.000Z",
      ended_at: "2026-11-05T11:00:00.000Z",
      notes: null,
    },
    {
      company_id: "c1",
      title: "Limpeza extra",
      client_id: "cl1",
      scheduled_for_wall: "2026-11-05T08:00",
      scheduled_end_wall: "2026-11-05T12:00",
    },
    "",
  );
  expect(calls[0][0]).toBe("punch_admin_create_with_task");
  expect(calls[0][1]._payload).not.toHaveProperty("task_id");
  expect(calls[0][1]._task).toMatchObject({
    title: "Limpeza extra",
    client_id: "cl1",
    scheduled_for_wall: "2026-11-05T08:00",
  });
  expect(r.task_id).toBe("t-nova");
});

test("erro do banco (tarefa igual, sem permissão) chega ao gestor", async () => {
  await expect(
    punchAdminCreateWithTask(
      { user_id: "u1", started_at: "2026-11-05T07:00:00.000Z" },
      { company_id: "c1", title: "X", client_id: "cl1", scheduled_for_wall: "2026-11-05T08:00" },
      "falha",
    ),
  ).rejects.toMatchObject({ message: expect.stringContaining("Já existe uma tarefa") });
});

test("editor: opção escrever tarefa nova, nome e cliente obrigatórios, hora de parede do ponto", () => {
  const d = readFileSync(
    new URL("../src/components/ponto/PunchEditorDrawer.tsx", import.meta.url),
    "utf8",
  );
  expect(NEW_TASK_OPTION).toBe("__new_task__");
  expect(d).toMatch(/<SelectItem value=\{NEW_TASK_OPTION\}>\+ Escrever tarefa nova<\/SelectItem>/);
  expect(d).toMatch(/Escreva o nome da tarefa nova/);
  expect(d).toMatch(/Escolha o cliente da tarefa nova/);
  expect(d).toMatch(/scheduled_for_wall: form\.started_at\.slice\(0, 16\)/);
  expect(d).toMatch(/\.eq\("status", "ativo"\)/);
  // as tarefas existentes continuam na lista
  expect(d).toMatch(/\(userTasks \?\? \[\]\)\.map/);
});
