import assert from "node:assert/strict";
import test from "node:test";
import { wallISOToInput } from "../src/lib/wall-clock.ts";
import { toLocalInput } from "../src/lib/punch-admin.ts";

// Tarefa planejada 06:00-10:00 em wall-clock (guardada como se fosse UTC).
const SCHEDULED_FOR = "2026-10-21T06:00:00.000Z";
const SCHEDULED_END = "2026-10-21T10:00:00.000Z";

test("manual punch prefills the task planned times without timezone shift", () => {
  assert.equal(wallISOToInput(SCHEDULED_FOR), "2026-10-21T06:00");
  assert.equal(wallISOToInput(SCHEDULED_END), "2026-10-21T10:00");
});

test("wallISOToInput never applies the device UTC offset to wall-clock times", () => {
  // Em qualquer fuso do dispositivo, 06:00 planejado deve sugerir 06:00.
  const expected = "2026-10-21T06:00";
  assert.equal(wallISOToInput(SCHEDULED_FOR), expected);
  // toLocalInput é o caminho ERRADO para horários de tarefa: aplica o offset local.
  // Em fuso != UTC ele desloca a sugestão; apenas garantimos que wallISOToInput não desloca.
  const shifted = toLocalInput(SCHEDULED_FOR);
  if (new Date().getTimezoneOffset() !== 0) {
    assert.notEqual(shifted, expected);
  }
});
