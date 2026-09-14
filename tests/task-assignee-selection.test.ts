import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addWallMinutes,
  distributeContractedMinutes,
  formatContractedMinutes,
} from "../src/lib/tasks/contracted-hours.ts";

const taskForm = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");

test("carga total do serviço é apenas redistribuída pela quantidade selecionada", () => {
  assert.deepEqual(distributeContractedMinutes(180, 2), [90, 90]);
  assert.deepEqual(distributeContractedMinutes(180, 1), [180]);
  assert.deepEqual(distributeContractedMinutes(240, 4), [60, 60, 60, 60]);
  assert.deepEqual(distributeContractedMinutes(240, 2), [120, 120]);
  for (const count of [1, 2, 3, 4, 5]) {
    const parts = distributeContractedMinutes(180, count);
    assert.equal(parts.length, count);
    assert.equal(parts.reduce((sum, value) => sum + value, 0), 180);
  }
  assert.equal(formatContractedMinutes(distributeContractedMinutes(180, 2)[0]), "1h30");
  assert.equal(formatContractedMinutes(distributeContractedMinutes(180, 1)[0]), "3h");
});

test("hora de fim acompanha a duração individual do responsável", () => {
  assert.deepEqual(addWallMinutes("2026-09-15", "08:00", distributeContractedMinutes(180, 2)[0]), {
    date: "2026-09-15",
    time: "09:30",
  });
  assert.deepEqual(addWallMinutes("2026-09-15", "08:00", distributeContractedMinutes(180, 1)[0]), {
    date: "2026-09-15",
    time: "11:00",
  });
});

test("equipe do cliente é sugestão e nunca sobrescreve a escolha manual", () => {
  assert.match(taskForm, /if \(!touchedAssignees\) \{/);
  assert.doesNotMatch(taskForm, /if \(!touchedAssignees \|\| assignees\.length === 0\) \{/);
  assert.match(taskForm, /responsáveis sugeridos pelo cadastro do cliente/);
});

test("trocar responsáveis reabre o recálculo automático da hora de fim", () => {
  assert.match(taskForm, /const assigneeCountRef = useRef\(assignees\.length\);/);
  assert.match(taskForm, /if \(contractedMinutes != null && assignees\.length > 0\) setManualEndOverride\(false\);/);
  assert.match(taskForm, /if \(\(initial && !touchedAssignees\) \|\| manualEndOverride/);
});

test("sem responsável selecionado a validação é clara e não trava em Salvando", () => {
  assert.match(taskForm, /Selecione pelo menos um funcionário para esta tarefa\./);
  assert.doesNotMatch(taskForm, /Atribua a tarefa a um funcionario antes de salvar/);
  assert.match(taskForm, /submittingRef\.current = false;\s*\n\s*setLoading\(false\);\s*\n\s*\}\s*\n\s*\}\}/);
});
