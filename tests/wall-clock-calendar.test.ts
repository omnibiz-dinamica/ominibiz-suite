import assert from "node:assert/strict";
import test from "node:test";
import { wallISOToDateInput } from "../src/lib/wall-clock.ts";

test("keeps a wall-clock task on its stored calendar date", () => {
  assert.equal(wallISOToDateInput("2026-09-03T00:30:00.000Z"), "2026-09-03");
  assert.equal(wallISOToDateInput("2026-09-03T23:30:00.000Z"), "2026-09-03");
});

