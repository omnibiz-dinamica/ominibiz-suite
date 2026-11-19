import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("docs/sql/notificacao_tarefa_20261119_aplicar.sql", "utf8");
const undo = readFileSync("docs/sql/notificacao_tarefa_20261119_desfazer.sql", "utf8");

describe("SUP-167 — notificação de tarefa com cliente, dia e hora", () => {
  test("um só texto para tarefa nova e reatribuída", () => {
    expect(sql).toContain("CREATE FUNCTION public._task_notification_body(");
    expect(sql).toContain(
      "v_body := public._task_notification_body(NEW.title, v_client, NEW.scheduled_for, NEW.recurrence_date, COALESCE(NEW.scheduled_end, NEW.due_at)); -- SUP-167",
    );
    expect(sql).toContain("'Tarefa atribuída a você'");
  });

  test("reatribuição leva link direto para a tarefa", () => {
    expect(sql).toContain("jsonb_build_object('link', '/app/tarefas?task=' || NEW.id::text");
  });

  test("hora de parede (UTC), cliente sem repetir o título", () => {
    expect(sql).toContain("to_char(_start AT TIME ZONE 'UTC', 'HH24:MI')");
    expect(sql).toContain("lower(btrim(_client)) <> lower(btrim(COALESCE(_title, '')))");
  });

  test("guardas e desfazer", () => {
    expect(sql).toContain("RAISE EXCEPTION 'PARAR: este script já foi aplicado");
    expect(sql).toContain("'notificacao_tarefa_20261119'");
    expect(undo).toContain("DROP FUNCTION IF EXISTS public._task_notification_body");
  });
});
