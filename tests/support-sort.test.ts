import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  SUPPORT_SORT_KEY_COMPANY,
  SUPPORT_SORT_OPTIONS,
  loadSupportSort,
  saveSupportSort,
  sortSupportTickets,
} from "../src/lib/support/sort";

const tickets = [
  { id: "b1", priority: "baixa" as const, created_at: "2026-11-01T10:00:00Z" },
  { id: "u2", priority: "urgente" as const, created_at: "2026-11-04T10:00:00Z" },
  { id: "n1", priority: "normal" as const, created_at: "2026-11-05T10:00:00Z" },
  { id: "u1", priority: "urgente" as const, created_at: "2026-11-02T10:00:00Z" },
  { id: "a1", priority: "alta" as const, created_at: "2026-11-03T10:00:00Z" },
];
const ids = (list: { id: string }[]) => list.map((t) => t.id);

test("Mais recentes: data de abertura, do mais novo ao mais antigo (como antes)", () => {
  expect(ids(sortSupportTickets(tickets, "recent"))).toEqual(["n1", "u2", "a1", "u1", "b1"]);
});

test("Urgente → Baixa; na mesma prioridade o mais antigo primeiro", () => {
  expect(ids(sortSupportTickets(tickets, "priority_desc"))).toEqual(["u1", "u2", "a1", "n1", "b1"]);
});

test("Baixa → Urgente; na mesma prioridade o mais antigo primeiro", () => {
  expect(ids(sortSupportTickets(tickets, "priority_asc"))).toEqual(["b1", "n1", "a1", "u1", "u2"]);
});

test("não altera a lista original", () => {
  const copy = ids(tickets);
  sortSupportTickets(tickets, "priority_desc");
  expect(ids(tickets)).toEqual(copy);
});

const g = globalThis as unknown as { window?: unknown };
afterEach(() => {
  delete g.window;
});

test("escolha guardada no navegador; valor inválido ou sem armazenamento volta a Mais recentes", () => {
  const store = new Map<string, string>();
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  };
  expect(loadSupportSort(SUPPORT_SORT_KEY_COMPANY)).toBe("recent");
  saveSupportSort(SUPPORT_SORT_KEY_COMPANY, "priority_asc");
  expect(loadSupportSort(SUPPORT_SORT_KEY_COMPANY)).toBe("priority_asc");
  store.set(SUPPORT_SORT_KEY_COMPANY, "qualquer");
  expect(loadSupportSort(SUPPORT_SORT_KEY_COMPANY)).toBe("recent");
  g.window = {
    localStorage: {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    },
  };
  expect(loadSupportSort(SUPPORT_SORT_KEY_COMPANY)).toBe("recent");
  expect(() => saveSupportSort(SUPPORT_SORT_KEY_COMPANY, "priority_desc")).not.toThrow();
});

// 15/11/2026: rótulos dizem também a data (dentro da prioridade, mais antiga primeiro)
// e há a opção "mais antigos primeiro".
test("as duas telas têm o seletor Ordenar com as 4 opções", () => {
  expect(SUPPORT_SORT_OPTIONS.map((o) => o.label)).toEqual([
    "Data: mais recentes primeiro",
    "Data: mais antigos primeiro",
    "Prioridade: Urgente → Baixa · data mais antiga → mais nova",
    "Prioridade: Baixa → Urgente · data mais antiga → mais nova",
  ]);
  for (const file of ["../src/routes/app.suporte.tsx", "../src/routes/app.admin.suporte.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(src).toMatch(/aria-label="Ordenar"/);
    expect(src).toMatch(/sortSupportTickets\((found|arr), sortOrder\)/);
  }
});

test("15/11/2026: Urgente → Baixa e, em cada prioridade, da data mais antiga para a mais nova", () => {
  const t = (id: string, priority: string, created_at: string) => ({ id, priority, created_at }) as never;
  const list = [
    t("b-novo", "baixa", "2026-11-10T10:00:00Z"),
    t("u-novo", "urgente", "2026-11-09T10:00:00Z"),
    t("b-antigo", "baixa", "2026-10-01T10:00:00Z"),
    t("u-antigo", "urgente", "2026-09-01T10:00:00Z"),
  ];
  expect(sortSupportTickets(list, "priority_desc").map((x: { id: string }) => x.id)).toEqual([
    "u-antigo",
    "u-novo",
    "b-antigo",
    "b-novo",
  ]);
  expect(sortSupportTickets(list, "oldest").map((x: { id: string }) => x.id)[0]).toBe("u-antigo");
});
