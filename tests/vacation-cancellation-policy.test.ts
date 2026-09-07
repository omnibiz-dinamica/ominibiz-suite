import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260906100000_sup_2026_000105_employee_cannot_cancel_approved_vacation.sql",
    import.meta.url,
  ),
  "utf8",
);
const page = readFileSync(new URL("../src/routes/app.ferias.tsx", import.meta.url), "utf8");

test("vacation cancellation policy protects approved vacations from employees", () => {
  assert.match(migration, /v_req\.user_id\s*=\s*v_uid\s+AND\s+v_req\.status\s*=\s*'aprovado'/);
  assert.match(migration, /Funcionário não pode cancelar férias já aprovadas/);
  assert.match(migration, /v_req\.user_id\s*=\s*v_uid\s+AND\s+v_req\.status\s+IN\s*\('pendente','pendente_confirmacao'\)/);
  assert.match(migration, /public\.is_company_manager\(v_uid, v_req\.company_id\)/);
  assert.match(migration, /public\.is_company_owner\(v_uid, v_req\.company_id\)/);
  assert.match(migration, /public\.is_super_admin\(v_uid\)/);
});

test("vacation UI keeps manager cancellation and explains the approved restriction", () => {
  assert.match(page, /Depois de aprovadas, as férias não podem ser canceladas pelo funcionário/);
  assert.match(page, /\{isManager && \(/);
  assert.match(page, /onCancel: \(\) => void/);
  assert.match(page, /Cancelar pedido/);
});
