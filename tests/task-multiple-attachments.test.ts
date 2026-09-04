import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("../src/lib/tasks/task-documents.ts", import.meta.url), "utf8");
const createRoute = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/tasks/TaskDocuments.tsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260904150000_sup_2026_000140_task_documents_tenant_guard.sql", import.meta.url),
  "utf8",
);

test("task file selection accumulates files and supports removing one before save", () => {
  assert.match(helper, /export function mergeTaskFiles/);
  assert.match(helper, /const seen = new Set\(current\.map\(fileKey\)\)/);
  assert.match(createRoute, /multiple/);
  assert.match(createRoute, /mergeTaskFiles\(current, Array\.from\(e\.target\.files/);
  assert.match(createRoute, /setPendingDocs\(\(current\) => current\.filter\(\(item\) => item !== file\)\)/);
});

test("creation and edition use the same canonical multi-upload helper", () => {
  assert.match(helper, /export async function uploadTaskDocuments/);
  assert.match(createRoute, /uploadTaskDocuments\(\{/);
  assert.match(createRoute, /files: pendingDocs/);
  assert.match(createRoute, /uploadedBy: userId/);
  assert.match(editor, /uploadTaskDocuments\(\{ taskId, companyId, files: selectedFiles \}\)/);
  assert.match(editor, /multiple/);
  assert.match(editor, /Anexar vários|Selecionar ficheiros/);
});

test("upload uses UUID paths and rolls back the current batch after a failure", () => {
  assert.match(helper, /crypto\.randomUUID\(\)/);
  assert.match(helper, /Never leave a storage object without its canonical metadata row/);
  assert.match(helper, /if \(error\) \{/);
  assert.match(helper, /storage\.from\("task-docs"\)\.remove\(\[doc\.storage_path\]\)/);
  assert.match(helper, /task_documents" as any\) as any\)\.delete\(\)/);
});

test("task documents preserve tenant isolation in table and storage policies", () => {
  assert.match(migration, /t\.company_id = task_documents\.company_id/);
  assert.match(migration, /t\.company_id = \(\(storage\.foldername\(name\)\)\[1\]\)::uuid/);
  assert.doesNotMatch(migration, /USING \(true\)/i);
  assert.doesNotMatch(migration, /WITH CHECK \(true\)/i);
});
