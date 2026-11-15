import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { colleaguesLabel, groupColleagues, groupDocuments } from "../src/lib/tasks/task-work-info";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("SUP-2026-000242: anexos, morada e colegas na tarefa do funcionário", () => {
  test("colegas agrupados por tarefa, sem repetir, por ordem alfabética", () => {
    const g = groupColleagues([
      {
        task_id: "t1",
        colleague_id: "b",
        colleague_name: "Paula Renata",
        colleague_status: "pendente",
      },
      { task_id: "t1", colleague_id: "a", colleague_name: "Dayane", colleague_status: "pendente" },
      { task_id: "t1", colleague_id: "a", colleague_name: "Dayane", colleague_status: "pendente" },
      { task_id: "t2", colleague_id: "c", colleague_name: " ", colleague_status: null },
    ]);
    expect(g.t1.map((c) => c.name)).toEqual(["Dayane", "Paula Renata"]);
    expect(g.t2[0].name).toBe("Colega");
    expect(colleaguesLabel(g.t1)).toBe("Dayane e Paula Renata");
    expect(colleaguesLabel([...g.t1, { id: "z", name: "Ariana", status: null }])).toBe(
      "Dayane, Paula Renata e Ariana",
    );
  });

  test("anexos agrupados por tarefa", () => {
    const doc = {
      company_id: "c",
      kind: "pdf",
      storage_path: "p",
      mime_type: null,
      size_bytes: 1,
      created_at: "",
    };
    const g = groupDocuments([
      { ...doc, id: "1", task_id: "t1", title: "A.pdf" },
      { ...doc, id: "2", task_id: "t1", title: "B.pdf" },
    ] as never);
    expect(g.t1.map((d) => d.title)).toEqual(["A.pdf", "B.pdf"]);
  });

  test("Folha de Ponto: anexos e colegas antes de iniciar; morada e colegas durante", () => {
    const ponto = read("../src/routes/app.ponto.tsx");
    expect(ponto).toContain(
      "<TaskWorkInfo colleagues={colleaguesByTask[nextStartable.id]} docs={docsByTask[nextStartable.id]} />",
    );
    expect(ponto).toContain(
      "<TaskWorkInfo colleagues={colleaguesByTask[t.id]} docs={docsByTask[t.id]} compact />",
    );
    expect(ponto).toContain(
      "<ClientAddressBlock info={task.client_id ? activeAddresses[task.client_id] : undefined} />",
    );
    expect(ponto).toContain("<TaskWorkInfo colleagues={activeColleagues[task.id]} />");
  });

  test("a função de colegas só lê, só das próprias tarefas, e tem desfazer", () => {
    const sql = read("../docs/sql/colegas_tarefa_20261115_aplicar.sql");
    expect(sql).toContain("STABLE SECURITY DEFINER");
    expect(sql).toContain("AND (t.assigned_to = auth.uid()");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.my_task_colleagues(uuid[]) FROM PUBLIC, anon;",
    );
    expect(read("../docs/sql/colegas_tarefa_20261115_desfazer.sql")).toContain(
      "DROP FUNCTION public.my_task_colleagues(uuid[]);",
    );
  });
});
