import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notifications = readFileSync(new URL("../src/routes/app.notificacoes.tsx", import.meta.url), "utf8");

test("shared vacation queue uses its dedicated atomic claim RPC", () => {
  assert.match(notifications, /vacation_manager_queue_claim/);
  assert.match(notifications, /vacation-manager-queue/);
  assert.doesNotMatch(notifications, /vacation_manager_queue[\s\S]{0,300}notification_set_state/);
});