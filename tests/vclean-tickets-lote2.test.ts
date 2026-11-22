import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { employerOptions, matchesEmployer } from "../src/lib/ponto/closing-employer";
import {
  forwardTargets,
  forwardTone,
  matchesForwardFilter,
} from "../src/lib/notifications/forwarding";

import { readSource } from "./helpers/read-source";
const read = (p: string) => readSource(p, "utf8");

describe("18/11 — tickets V-clean, lote 2", () => {
  test("SUP-307: anotação da tarefa visível no calendário e no formulário", () => {
    const cal = read("src/components/tasks/page/calendar.tsx");
    expect(cal).toContain('data-testid="task-note"');
    expect(cal).toContain('aria-label="Tem anotação"');
    expect(read("src/components/tasks/page/task-form.tsx")).toContain("Anotação / descrição");
  });

  test("SUP-161: Léa rosa, Luc roxo, Contabilista verde; filtro por pessoa", () => {
    expect(forwardTone("Léa")).toContain("pink");
    expect(forwardTone("lea")).toContain("pink");
    expect(forwardTone("LUC")).toContain("purple");
    expect(forwardTone("Contabilista")).toContain("emerald");
    expect(forwardTone("Direção")).toBeNull();
    expect(forwardTargets(["Luc", "Zé", "lea", "Léa", null, "Contabilista"])).toEqual([
      "Contabilista",
      "lea",
      "Luc",
      "Zé",
    ]);
    expect(matchesForwardFilter("Léa", "lea")).toBe(true);
    expect(matchesForwardFilter("Luc", "lea")).toBe(false);
    expect(matchesForwardFilter("Luc", "")).toBe(true);
    expect(read("src/routes/app.notificacoes.tsx")).toContain('data-testid="forward-filter"');
  });

  test("SUP-322: fechamento por empresa (cargo / função)", () => {
    const rows = [
      { job_title: "Life Tidy" },
      { job_title: "life tidy" },
      { job_title: "Letras Modestas" },
      { job_title: null },
    ];
    const opts = employerOptions(rows);
    expect(opts.map((o) => `${o.label}:${o.count}`)).toEqual([
      "Letras Modestas:1",
      "Life Tidy:2",
      "Sem empresa:1",
    ]);
    expect(matchesEmployer("Life Tidy", "life tidy")).toBe(true);
    expect(matchesEmployer("Letras Modestas", "life tidy")).toBe(false);
    expect(matchesEmployer(null, "__none__")).toBe(true);
    expect(matchesEmployer("x", "all")).toBe(true);
    expect(employerOptions([{ job_title: null }])).toEqual([]);
    expect(read("src/routes/app.ponto_.fechamento.tsx")).toContain(
      "matchesEmployer(r.job_title, employer)",
    );
  });

  test("SUP-306: vista Dia em grelha por colaborador", () => {
    expect(read("src/components/tasks/page/calendar.tsx")).toContain(
      '"grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"',
    );
  });
});
