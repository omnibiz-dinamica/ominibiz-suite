import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createCoalescedRefresh, mergeFreshTasks } from "../src/lib/tasks/fresh-tasks";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

type T = {
  id: string;
  company_id: string;
  assigned_to: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  scheduled_for: string | null;
  recurrence_date: string | null;
  due_at: string | null;
  created_at: string | null;
  title?: string;
};
const task = (id: string, p: Partial<T> = {}): T => ({
  id,
  company_id: "c1",
  assigned_to: "u1",
  archived_at: null,
  deleted_at: null,
  scheduled_for: null,
  recurrence_date: null,
  due_at: null,
  created_at: "2026-11-16T08:00:00Z",
  ...p,
});
const manager = { companyId: "c1", userId: "m1", isManager: true, view: "active" };

describe("tarefa gravada aparece já na lista", () => {
  test("entra na posição da ordem da consulta (scheduled_for asc, nulos no fim)", () => {
    const list = [
      task("a", { scheduled_for: "2026-11-16T08:00:00Z" }),
      task("b", { scheduled_for: "2026-11-18T08:00:00Z" }),
      task("z"),
    ];
    const out = mergeFreshTasks(
      list,
      [task("n", { scheduled_for: "2026-11-17T09:00:00Z" })],
      manager,
    )!;
    expect(out.map((t) => t.id)).toEqual(["a", "n", "b", "z"]);
  });

  test("nunca duplica: a mesma tarefa substitui a versão em cache", () => {
    const list = [task("a", { title: "antigo" })];
    const out = mergeFreshTasks(
      list,
      [task("a", { title: "novo" }), task("a", { title: "novo" })],
      manager,
    )!;
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("novo");
  });

  test("respeita vista, empresa, arquivo e funcionário", () => {
    const list = [task("a")];
    const fresh = [
      task("arch", { archived_at: "2026-11-16T09:00:00Z" }),
      task("del", { deleted_at: "2026-11-16T09:00:00Z" }),
      task("outra", { company_id: "c2" }),
      task("alheia", { assigned_to: "u2" }),
    ];
    expect(
      mergeFreshTasks(list, fresh, manager)!
        .map((t) => t.id)
        .sort(),
    ).toEqual(["a", "alheia"]);
    const employee = { companyId: "c1", userId: "u1", isManager: false, view: "active" };
    expect(mergeFreshTasks(list, fresh, employee)).toBe(list);
    const archived = { ...manager, view: "archived" };
    expect(mergeFreshTasks([], fresh, archived)!.map((t) => t.id)).toEqual(["arch"]);
  });

  test("tarefa editada que passou a arquivada sai da lista de ativas", () => {
    const list = [task("a"), task("b")];
    const out = mergeFreshTasks(
      list,
      [task("b", { archived_at: "2026-11-16T10:00:00Z" })],
      manager,
    )!;
    expect(out.map((t) => t.id)).toEqual(["a"]);
  });

  test("sem lista em cache não inventa uma", () => {
    expect(mergeFreshTasks(undefined, [task("a")], manager)).toBeUndefined();
  });
});

describe("realtime agrupa avisos e não cancela a leitura em curso", () => {
  test("rajada de avisos → uma releitura; espera a leitura em curso terminar", async () => {
    const qc = new QueryClient();
    let fetches = 0;
    let release: () => void = () => {};
    qc.setQueryDefaults(["tasks"], { retry: false });
    const observer = new QueryObserver(qc, {
      queryKey: ["tasks", "c1"],
      queryFn: () =>
        new Promise<number>((resolve) => {
          fetches += 1;
          release = () => resolve(fetches);
        }),
    });
    const unsubscribe = observer.subscribe(() => {});
    expect(qc.isFetching({ queryKey: ["tasks"] })).toBe(1);

    const r = createCoalescedRefresh(qc, ["tasks"], 10);
    for (let i = 0; i < 52; i++) r.trigger();
    await new Promise((res) => setTimeout(res, 40));
    // Ainda a ler: nada foi cancelado nem recomeçado.
    expect(fetches).toBe(1);
    release();
    await new Promise((res) => setTimeout(res, 40));
    expect(fetches).toBe(2);
    release();
    r.dispose();
    unsubscribe();
  });
});

describe("ligações na página de tarefas", () => {
  const page = read("../src/routes/app.tarefas.tsx");
  const form = read("../src/components/tasks/page/task-form.tsx");

  test("criar/editar mostra as tarefas gravadas já", () => {
    expect(page).toContain("showSavedTasks(qc, currentCompanyId, saved)");
    expect(page).toContain("showSavedTasks(qc, editing.company_id, saved)");
    expect(form).toContain("savedRecurrenceIds.push(...toMaterialize)");
    expect(form).toMatch(/onDone\(\{\s*taskIds:/);
  });

  test("realtime usa a releitura agrupada", () => {
    expect(page).toContain("tasksRefresh.trigger()");
    expect(page).toContain("punchesRefresh.trigger()");
    expect(page).not.toMatch(/table: "tasks" \}, \(\) =>\s*qc\.invalidateQueries/);
  });
});
