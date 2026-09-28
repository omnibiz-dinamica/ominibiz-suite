import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const taskForm = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const softDelete = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), "utf8"))
  .filter((sql) => sql.includes("FUNCTION public.task_soft_delete"))
  .at(-1)!;

test("hora de fim nunca é preenchida pelo sistema", () => {
  // O sistema não deriva mais a hora de fim a partir dos minutos contratados.
  assert.doesNotMatch(taskForm, /setEndTime\(\(current\) =>/);
  // A distribuição contratada só recalcula uma hora de fim já registada.
  assert.match(taskForm, /startTime !== "" && endTime !== ""/);
  // A gravação mantém scheduled_end nulo quando não há hora de fim.
  assert.match(taskForm, /const endISO = endTime \? wallDateTimeToISO\(resolvedEndDate, endTime\) : null;/);
  assert.match(taskForm, /scheduled_end: endISO,/);
});

test("anexos não bloqueiam a exclusão de tarefa não iniciada", () => {
  assert.doesNotMatch(softDelete, /EXISTS \(SELECT 1 FROM public\.task_documents/);
  assert.match(softDelete, /FROM public\.time_entries WHERE task_id = _task_id/);
  assert.match(softDelete, /DELETE FROM public\.task_documents WHERE task_id = _task_id;/);
  assert.match(softDelete, /status IN \('em_andamento','concluido'\)/);
});

test("o modal de exclusão informa a existência de anexos", () => {
  assert.match(taskForm, /queryKey: \["task-documents-count", deleting\?\.id\]/);
  assert.match(taskForm, /Atenção: esta tarefa tem \{deletingDocsCount\}/);
});
