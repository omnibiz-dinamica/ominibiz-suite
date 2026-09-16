import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const tasksPage = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
const recurrencesPage = readFileSync(
  new URL("../src/routes/app.tarefas.recorrentes.tsx", import.meta.url),
  "utf8",
);

/**
 * Horizonte rolante de materialização (16092026).
 *
 * Regras:
 * - a pré-geração de ocorrências nunca passa de 12 meses;
 * - séries sem data final continuam sem data final: o limite é apenas técnico;
 * - a geração é sempre por série (nunca a empresa inteira numa chamada só).
 */

test("criacao de recorrencia pre-gera 12 meses, serie por serie", () => {
  assert.match(tasksPage, /const horizon = 365/);
  assert.match(tasksPage, /for \(const recurrenceId of createdRecurrenceIds\)/);
  assert.match(tasksPage, /_recurrence_id: recurrenceId/);
});

test("geracao manual usa o horizonte de 12 meses e nunca varre a empresa numa chamada", () => {
  assert.match(recurrencesPage, /const MATERIALIZE_HORIZON_DAYS = 365/);
  assert.match(recurrencesPage, /for \(const serie of active\)/);
  assert.match(
    recurrencesPage,
    /recurrenceMaterialize\(MATERIALIZE_HORIZON_DAYS, currentCompanyId, serie\.id\)/,
  );
  assert.doesNotMatch(recurrencesPage, /recurrenceMaterialize\(60, currentCompanyId\)/);
});

test("a interface nao promete mais janela de 60 dias", () => {
  assert.doesNotMatch(recurrencesPage, /60d/);
  assert.doesNotMatch(tasksPage, /Gerar próximas 60d/);
  assert.match(recurrencesPage, /Gerar próximos 12 meses/);
});

test("falha de geracao continua sendo erro real na tela", () => {
  assert.match(tasksPage, /toast\.error\(\s*`Recorrência salva, mas as ocorrências não foram geradas/);
  assert.doesNotMatch(tasksPage, /As próximas ocorrências serão geradas automaticamente/);
});

test("nenhuma tela preenche data final da serie para limitar o horizonte", () => {
  assert.doesNotMatch(recurrencesPage, /end_date:\s*.*12 months/);
  assert.doesNotMatch(tasksPage, /end_date:\s*.*365/);
});
