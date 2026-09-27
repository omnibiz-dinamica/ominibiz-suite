import assert from "node:assert/strict";
import test from "node:test";
import { isEmployeeActive } from "../src/lib/employee-status";

const TODAY = "2026-09-27";

test("oculta quem está marcado como inativo", () => {
  assert.equal(isEmployeeActive({ is_active: false }, TODAY), false);
  assert.equal(isEmployeeActive({ is_active: true, status: "inativo" }, TODAY), false);
});

test("oculta na data de saída e depois dela", () => {
  assert.equal(isEmployeeActive({ is_active: true, termination_date: TODAY }, TODAY), false);
  assert.equal(isEmployeeActive({ is_active: true, termination_date: "2026-09-26" }, TODAY), false);
});

test("mantém ativo antes da data de saída", () => {
  assert.equal(isEmployeeActive({ is_active: true, status: "ativo", termination_date: "2026-09-30" }, TODAY), true);
});