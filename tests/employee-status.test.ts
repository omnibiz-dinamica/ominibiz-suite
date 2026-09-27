import { describe, expect, test } from "bun:test";
import { isEmployeeActive } from "../src/lib/employee-status";

const TODAY = "2026-09-27";

describe("estado global do funcionário", () => {
  test("oculta quem está marcado como inativo", () => {
    expect(isEmployeeActive({ is_active: false }, TODAY)).toBe(false);
    expect(isEmployeeActive({ is_active: true, status: "inativo" }, TODAY)).toBe(false);
  });

  test("oculta na data de saída e depois dela", () => {
    expect(isEmployeeActive({ is_active: true, termination_date: TODAY }, TODAY)).toBe(false);
    expect(isEmployeeActive({ is_active: true, termination_date: "2026-09-26" }, TODAY)).toBe(false);
  });

  test("mantém ativo antes da data de saída", () => {
    expect(isEmployeeActive({ is_active: true, status: "ativo", termination_date: "2026-09-30" }, TODAY)).toBe(true);
  });
});