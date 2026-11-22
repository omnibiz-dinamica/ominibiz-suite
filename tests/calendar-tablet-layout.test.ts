import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { splitClientHeading, weekColumnsTemplate } from "../src/components/tasks/page/shared";

describe("Calendário no tablet", () => {
  test("prefixo curto do cliente fica pequeno, morada em destaque", () => {
    expect(splitClientHeading("HappyKot - CASTER 4 CM")).toEqual({
      prefix: "HappyKot",
      main: "CASTER 4 CM",
    });
    expect(splitClientHeading("FRITUUR JAGERSHOF - Sra Lore NOSSO")).toEqual({
      prefix: "FRITUUR JAGERSHOF",
      main: "Sra Lore NOSSO",
    });
    // prefixo longo: fica inteiro
    expect(splitClientHeading("Trabalho novo perto do Spork cafe - CM")).toEqual({
      prefix: null,
      main: "Trabalho novo perto do Spork cafe - CM",
    });
    expect(splitClientHeading("Lixo")).toEqual({ prefix: null, main: "Lixo" });
  });

  test("dias vazios ficam estreitos; semana vazia = colunas iguais", () => {
    expect(weekColumnsTemplate([5, 6, 3, 3, 3, 0, 0])).toBe(
      "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(4.5rem, 0.35fr) minmax(4.5rem, 0.35fr)",
    );
    expect(weekColumnsTemplate([0, 0, 0, 0, 0, 0, 0])).toBe("repeat(7, minmax(0, 1fr))");
  });

  test("cartão: seleção e lápis numa linha própria, nome em largura inteira", () => {
    const cal = readFileSync("src/components/tasks/page/calendar.tsx", "utf8");
    expect(cal).toContain('data-testid="task-card-toolbar"');
    expect(cal).toContain("<TaskCardHeading name={taskHeading(task)} />");
    expect(cal).toContain("lg:[grid-template-columns:var(--week-cols)]");
  });
});
