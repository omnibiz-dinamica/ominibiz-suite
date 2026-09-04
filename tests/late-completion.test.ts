import test from "node:test";
import assert from "node:assert/strict";
import { defaultRecoveryEndInput } from "../src/lib/punch/recovery-time.ts";

test("regularizacao sugere a data real da entrada para tarefa do dia anterior", () => {
  assert.equal(
    defaultRecoveryEndInput("2026-09-02T09:05", new Date(2026, 8, 3, 13, 10)),
    "2026-09-02T13:10",
  );
});

test("regularizacao usa a data atual quando a entrada armazenada e invalida", () => {
  assert.equal(
    defaultRecoveryEndInput("valor-invalido", new Date(2026, 8, 3, 13, 10)),
    "2026-09-03T13:10",
  );
});
