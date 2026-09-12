import test from "node:test";
import assert from "node:assert/strict";
import {
  CHANGE_LOG,
  changeDatePart,
  latestChangeId,
  nextChangeId,
  parseChangeId,
} from "../src/lib/change-log.ts";

test("identificadores seguem DDMMAAAA-XXXc/a", () => {
  for (const entry of CHANGE_LOG) {
    const parsed = parseChangeId(entry.id);
    assert.ok(parsed, `identificador inválido: ${entry.id}`);
    assert.equal(parsed.kind, entry.kind);
    assert.ok(entry.summary.trim().length > 0);
  }
  assert.equal(parseChangeId("11092026-001x"), null);
  assert.equal(parseChangeId("1192026-001c"), null);
});

test("identificadores nunca são reutilizados e mantêm a sequência", () => {
  const ids = CHANGE_LOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(changeDatePart({ day: 11, month: 9, year: 2026 }), "11092026");
  assert.equal(nextChangeId("11092026", "c", ids), "11092026-006c");
  assert.equal(nextChangeId("12092026", "a", ids), "12092026-004a");
  assert.equal(latestChangeId(), ids[ids.length - 1]);
});
