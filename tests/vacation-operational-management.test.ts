import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260904170000_show_approved_vacations_in_operational_management.sql",
    import.meta.url,
  ),
  "utf8",
);
const performanceRepair = readFileSync(
  new URL(
    "../supabase/migrations/20260904200000_fix_operational_vacation_feed_performance.sql",
    import.meta.url,
  ),
  "utf8",
);
const canonicalRepair = readFileSync(
  new URL(
    "../supabase/migrations/20260904223301_01227e71-9bb3-4465-90b0-e9dc84720b0d.sql",
    import.meta.url,
  ),
  "utf8",
);

test("approved vacations are included in the protected operational feed without synthetic punches", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.timesheet_operational_list/);
  assert.match(migration, /vacation_rows AS/);
  assert.match(migration, /FROM public\.vacation_requests vr/);
  assert.match(migration, /vr\.company_id = _company_id AND vr\.status = 'aprovado'/);
  assert.match(migration, /AND \(_employee_id IS NULL OR vr\.user_id = _employee_id\)/);
  assert.match(migration, /UNION ALL SELECT \* FROM vacation_rows/);
  assert.doesNotMatch(migration, /INSERT INTO public\.time_entries/);
});

test("vacation entries are non-editable operational records with a visible label", () => {
  const managementPage = readFileSync(
    new URL("../src/routes/app.ponto_.gestao.tsx", import.meta.url),
    "utf8",
  );
  const punchTypes = readFileSync(new URL("../src/lib/punch-admin.ts", import.meta.url), "utf8");

  assert.match(punchTypes, /\| "vacation"/);
  assert.match(punchTypes, /vacation: "Férias aprovadas"/);
  assert.match(managementPage, /const isVacation = \(r: Row\) => r\.record_kind === "vacation"/);
  assert.match(managementPage, /if \(isVacation\(r\)\) return "Férias"/);
  assert.match(
    managementPage,
    /r\.tasks\?\.recurrence_date\s*\?\s*formatWallDate\(r\.tasks\.recurrence_date\)/,
  );
  assert.match(managementPage, /isOperationalTask\(r\) \|\| isVacation\(r\)/);
});

test("operational vacation feed keeps one row per approved period and cannot block real punches", () => {
  assert.match(performanceRepair, /SELECT vr\.id, vr\.company_id/);
  assert.match(performanceRepair, /vr\.end_date >= _from_date/);
  assert.match(performanceRepair, /vr\.start_date <= _to_date/);
  assert.doesNotMatch(performanceRepair, /generate_series/);
  assert.doesNotMatch(performanceRepair, /INSERT INTO public\.time_entries/);
});

test("canonical operational feed preserves real punches and excludes future tasks", () => {
  assert.match(canonicalRepair, /LEFT JOIN public\.tasks t ON t\.id = te\.task_id AND t\.company_id = te\.company_id/);
  assert.doesNotMatch(canonicalRepair, /t\.id IS NULL OR \(t\.archived_at IS NULL/);
  assert.match(canonicalRepair, /t\.scheduled_for <= now\(\)/);
  assert.match(canonicalRepair, /NOT EXISTS \(SELECT 1 FROM public\.time_entries te WHERE te\.task_id = t\.id AND te\.voided_at IS NULL\)/);
  assert.match(canonicalRepair, /FROM page AS x/);
  assert.match(canonicalRepair, /EXISTS \(SELECT 1 FROM public\.user_roles ur WHERE ur\.company_id = vr\.company_id AND ur\.user_id = vr\.user_id\)/);
  assert.doesNotMatch(canonicalRepair, /generate_series|pg_get_functiondef|INSERT INTO public\.time_entries/);
});

test("management page exposes RPC failures instead of silently showing zero", () => {
  const managementPage = readFileSync(new URL("../src/routes/app.ponto_.gestao.tsx", import.meta.url), "utf8");
  const punchAdmin = readFileSync(new URL("../src/lib/punch-admin.ts", import.meta.url), "utf8");
  assert.match(managementPage, /isError, error, refetch/);
  assert.match(managementPage, /Não foi possível carregar a Folha de Ponto/);
  assert.match(managementPage, /isError \? "Falha ao carregar registros"/);
  assert.match(punchAdmin, /resposta inválida do servidor/);
  assert.doesNotMatch(punchAdmin, /data \?\? \{\}/);
});
