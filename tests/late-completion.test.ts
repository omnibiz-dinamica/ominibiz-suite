import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultRecoveryEndInput } from "../src/lib/punch/recovery-time.ts";

const pointSource = readFileSync(new URL("../src/routes/app.ponto.tsx", import.meta.url), "utf8");
const tasksSource = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");

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

test("conclusao normal tardia usa o stop atual e nao a recuperacao", () => {
  const scheduledEnd = new Date("2026-09-10T12:00:00Z");
  const clickedAt = new Date("2026-09-10T13:17:00Z");
  assert.ok(clickedAt > scheduledEnd);
  assert.equal(clickedAt.toISOString(), "2026-09-10T13:17:00.000Z");
  assert.doesNotMatch(pointSource, /isLateOpenEntry/);
  assert.doesNotMatch(pointSource, /requiresManualEnd=/);
  assert.doesNotMatch(pointSource, /recoverOpenEntry/);
  assert.doesNotMatch(pointSource, /Finalizar com hora correta/);
  assert.match(pointSource, /onComplete=\{\(\) => \(isManualOpenTask \? openManualEndDialog\(\) : setCompletionDialogOpen\(true\)\)\}/);
  assert.match(pointSource, /punch\.run\(\{ op: "stop", entryId: openEntry\.id \}\)/);
  assert.match(pointSource, /Observação da conclusão \(opcional\)/);
  assert.match(tasksSource, /const isOtherUser = isManager && task\.assigned_to !== user\?\.id;/);
  assert.match(tasksSource, /if \(isOtherUser\) \{/);
  assert.doesNotMatch(tasksSource, /startedDay !== today/);
});
