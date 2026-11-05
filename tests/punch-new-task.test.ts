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

const { punchAdminCreateWithTask } = await import("../src/lib/punch-admin");

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

test("Adicionar ponto: sem vincular tarefa; cliente, nome opcional e fim obrigatório", () => {
  const d = readFileSync(
    new URL("../src/components/ponto/PunchEditorDrawer.tsx", import.meta.url),
    "utf8",
  );
  // fluxo do botão do topo: nunca escolhe tarefa existente
  expect(d).toMatch(
    /const writingNewTask = mode === "create" && !regularizeTaskAbsence && form\.entry_kind === "work";/,
  );
  expect(d).not.toMatch(/Escrever tarefa nova/);
  expect(d).not.toMatch(/punch-admin-user-tasks/);
  expect(d).toMatch(/<Label>Cliente \*<\/Label>/);
  expect(d).toMatch(/Nome da tarefa \(opcional\)/);
  expect(d).toMatch(/`Atendimento - \$\{newTaskClientName\}`/);
  expect(d).toMatch(/Informe o fim do ponto: a tarefa é criada já concluída/);
  expect(d).toMatch(/writingNewTask \? "Fim \*" : "Fim"/);
  expect(d).toMatch(/scheduled_for_wall: form\.started_at\.slice\(0, 16\)/);
  expect(d).toMatch(/\.eq\("status", "ativo"\)/);
  // regularização de falta continua ligada à tarefa da falta
  expect(d).toMatch(
    /if \(regularizeTaskAbsence\) \{\s*return punchAbsenceRegularize\(\s*form\.task_id/,
  );
});

test("o painel só abre no clique: rascunho não reabre sozinho", () => {
  const d = readFileSync(
    new URL("../src/components/ponto/PunchEditorDrawer.tsx", import.meta.url),
    "utf8",
  );
  expect(d).not.toMatch(/onOpenChange\(true\)/);
  expect(d).not.toMatch(/reopenedRef/);
});
