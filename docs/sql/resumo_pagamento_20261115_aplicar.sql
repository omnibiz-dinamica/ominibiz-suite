-- =====================================================================
-- OmniBiz · 15/11/2026 — SUP-2026-000302: Resumo para pagamento.
-- Desfazer: resumo_pagamento_20261115_desfazer.sql
--
-- Junta, por funcionário e mês:
--  • o que a FOLHA DE PONTO contabilizou (horas semana / fim de semana e
--    feriado, dias, folga remunerada, total) — da versão assinada/fechada da
--    folha; se a folha ainda não estiver fechada, da folha atual (provisório);
--  • renda, transporte, alimentação e outros (cadastro do funcionário),
--    despesas aprovadas, acréscimos/descontos e o adiantamento (avanço) —
--    das tabelas de pagamento que já existem (payroll_monthly_report);
--  • total, avanço e 2.º pagamento.
-- A folha passa também a guardar summary.pay_lines (linhas de pagamento:
-- horas semana, horas fim de semana/feriado, dias, folga remunerada, mensal,
-- valor fixo), calculadas dos mesmos valores da folha. Folhas assinadas antes
-- desta data não as têm: o resumo mostra então a composição por cliente.
-- payroll_payment_summary é só leitura (STABLE). Quem pode ler: os mesmos de
-- payroll_monthly_report (gestor/owner da empresa, super admin).
-- =====================================================================
BEGIN;

DO $guard$
DECLARE d text;
BEGIN
  IF to_regprocedure('public.payroll_payment_summary(uuid,integer,integer)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'resumo_pagamento_20261115') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.payroll_monthly_report(uuid,integer,integer)') IS NULL
     OR to_regprocedure('public.timesheet_build_snapshot(uuid,uuid,integer,integer)') IS NULL
     OR to_regclass('public.timesheet_period_versions') IS NULL THEN
    RAISE EXCEPTION 'PARAR: faltam funções/tabelas de pagamento ou da folha. Nada foi alterado.';
  END IF;
  d := pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure);
  IF position('INTO v_amount, v_currency, v_pay_model, v_rate, v_rate_source, v_by_client, v_by_daytype' IN d) = 0
     OR position('''by_day_type'', v_by_daytype)' IN d) = 0
     OR position('v_by_daytype jsonb := ''{}''::jsonb;' IN d) = 0
     OR position('AS day_type' IN d) = 0 THEN
    RAISE EXCEPTION 'PARAR: a folha não tem o resumo semana/fim de semana de 14/11 (corra primeiro pagamento_funcionario_20261114). Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'resumo_pagamento_20261115', 'public.timesheet_build_snapshot(uuid,uuid,integer,integer)',
       pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure),
       md5(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure));

-- ---------------------------------------------------------------------
-- 1) A folha guarda as linhas de pagamento (summary.pay_lines)
-- ---------------------------------------------------------------------
DO $p$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure);
  n := replace(d, 'v_by_daytype jsonb := ''{}''::jsonb;',
                  'v_by_daytype jsonb := ''{}''::jsonb; v_pay_lines jsonb := ''[]''::jsonb;');
  n := replace(n, 'INTO v_amount, v_currency, v_pay_model, v_rate, v_rate_source, v_by_client, v_by_daytype',
$r$-- 15/11/2026 (SUP-302): linhas de pagamento
         , (SELECT COALESCE(jsonb_agg(pl.o ORDER BY pl.o->>'order'), '[]'::jsonb) FROM (
             SELECT jsonb_build_object(
                      'order', g.ord, 'code', g.code, 'label', g.label, 'unit', g.unit,
                      'quantity', CASE WHEN g.unit = 'hora' THEN round(SUM(g.effective_minutes) / 60.0, 2)
                                       WHEN g.unit = 'dia' THEN COUNT(DISTINCT g.task_day)
                                       WHEN g.unit = 'mês' THEN 1
                                       ELSE COUNT(*) END,
                      'minutes', SUM(g.effective_minutes),
                      'rate', CASE WHEN COUNT(DISTINCT g.unit_rate) = 1 THEN MAX(g.unit_rate) END,
                      'amount', round(COALESCE(SUM(g.amount), 0), 2)) AS o
             FROM (
               SELECT w.*,
                 CASE WHEN lower(btrim(COALESCE(w.client_name, ''))) = 'folga remunerada' THEN '05'
                      WHEN w.pay_model_used = 'hourly' AND w.day_type IN ('weekend', 'holiday') THEN '02'
                      WHEN w.pay_model_used = 'hourly' THEN '01'
                      WHEN w.pay_model_used = 'daily' THEN '03'
                      WHEN w.pay_model_used = 'monthly' THEN '04'
                      ELSE '06' END AS ord,
                 CASE WHEN lower(btrim(COALESCE(w.client_name, ''))) = 'folga remunerada' THEN 'paid_day_off'
                      WHEN w.pay_model_used = 'hourly' AND w.day_type IN ('weekend', 'holiday') THEN 'hour_weekend'
                      WHEN w.pay_model_used = 'hourly' THEN 'hour_week'
                      WHEN w.pay_model_used = 'daily' THEN 'day'
                      WHEN w.pay_model_used = 'monthly' THEN 'monthly'
                      ELSE 'fixed' END AS code,
                 CASE WHEN lower(btrim(COALESCE(w.client_name, ''))) = 'folga remunerada' THEN 'Folga remunerada'
                      WHEN w.pay_model_used = 'hourly' AND w.day_type IN ('weekend', 'holiday') THEN 'Horas fim de semana / feriado'
                      WHEN w.pay_model_used = 'hourly' THEN 'Horas semana'
                      WHEN w.pay_model_used = 'daily' THEN 'Dias'
                      WHEN w.pay_model_used = 'monthly' THEN 'Salário mensal'
                      ELSE 'Tarefas (valor fixo)' END AS label,
                 CASE WHEN lower(btrim(COALESCE(w.client_name, ''))) = 'folga remunerada' THEN 'dia'
                      WHEN w.pay_model_used = 'hourly' THEN 'hora'
                      WHEN w.pay_model_used = 'daily' THEN 'dia'
                      WHEN w.pay_model_used = 'monthly' THEN 'mês'
                      ELSE 'tarefa' END AS unit
               FROM vv w
             ) g
             GROUP BY g.ord, g.code, g.label, g.unit
           ) pl)
  INTO v_amount, v_currency, v_pay_model, v_rate, v_rate_source, v_by_client, v_by_daytype, v_pay_lines$r$);
  n := replace(n, '''by_day_type'', v_by_daytype)', '''by_day_type'', v_by_daytype, ''pay_lines'', v_pay_lines)');
  IF n = d OR position('v_pay_lines jsonb' IN n) = 0 OR position('''pay_lines'', v_pay_lines' IN n) = 0
     OR position('v_by_daytype, v_pay_lines' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: troca em timesheet_build_snapshot falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p$;

-- ---------------------------------------------------------------------
-- 2) Resumo para pagamento
-- ---------------------------------------------------------------------

CREATE FUNCTION public.payroll_payment_summary(_company_id uuid, _year integer, _month integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base jsonb;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_snap jsonb;
  v_src text;
  v_b jsonb;
  v_work numeric;
  v_extra numeric;
  v_total numeric;
  v_adv numeric;
BEGIN
  -- Autorização e dados de pagamento (renda, despesas, ajustes, avanço)
  v_base := public.payroll_monthly_report(_company_id, _year, _month);

  FOR r IN
    SELECT p.id AS period_id, p.employee_id, p.status::text AS status, p.current_version,
           COALESCE(NULLIF(btrim(pr.full_name), ''), 'Funcionário') AS full_name
    FROM public.timesheet_periods p
    LEFT JOIN public.profiles pr ON pr.id = p.employee_id
    WHERE p.company_id = _company_id AND p.period_year = _year AND p.period_month = _month
    ORDER BY lower(COALESCE(pr.full_name, ''))
  LOOP
    v_snap := NULL; v_src := 'provisorio';
    IF COALESCE(r.current_version, 0) > 0 THEN
      SELECT v.snapshot INTO v_snap FROM public.timesheet_period_versions v
      WHERE v.period_id = r.period_id AND v.version = r.current_version
      LIMIT 1;
      IF v_snap IS NOT NULL THEN v_src := 'versao'; END IF;
    END IF;
    IF v_snap IS NULL THEN
      v_snap := public.timesheet_build_snapshot(_company_id, r.employee_id, _year, _month);
    END IF;

    SELECT e INTO v_b FROM jsonb_array_elements(v_base->'employees') e
    WHERE (e->>'employee_id')::uuid = r.employee_id LIMIT 1;

    v_work := COALESCE(
      CASE WHEN v_snap->'summary'->>'payment_type_used' = 'monthly'
           THEN (v_snap->'summary'->>'monthly_amount')::numeric END,
      (v_snap->'summary'->>'calculated_amount')::numeric, 0);
    v_extra := COALESCE((v_b->>'allowances_total')::numeric, 0)
             + COALESCE((v_b->>'expenses_total')::numeric, 0)
             + COALESCE((v_b->>'adjustments_total')::numeric, 0);
    v_total := round(v_work + v_extra, 2);
    v_adv := COALESCE((v_b->>'advance')::numeric, 0);

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'employee_id', r.employee_id,
      'full_name', r.full_name,
      'period_status', r.status,
      'final', r.status IN ('fechado_gestor', 'disponivel_contabilidade'),
      'source', v_src,
      'version', NULLIF(COALESCE(r.current_version, 0), 0),
      'payment_type_used', v_snap->'summary'->>'payment_type_used',
      'worked_minutes', COALESCE((v_snap->'summary'->>'worked_minutes')::int, 0),
      'paid_days', COALESCE((v_snap->'summary'->>'paid_days')::int, 0),
      'by_day_type', v_snap->'summary'->'by_day_type',
      'by_client', COALESCE(v_snap->'summary'->'by_client', '[]'::jsonb),
      'pay_lines', v_snap->'summary'->'pay_lines',
      'work_total', round(v_work, 2),
      'allowances', COALESCE(v_b->'allowances', '[]'::jsonb),
      'expenses', COALESCE(v_b->'expenses', '[]'::jsonb),
      'adjustments', COALESCE(v_b->'adjustments', '[]'::jsonb),
      'allowances_total', COALESCE((v_b->>'allowances_total')::numeric, 0),
      'expenses_total', COALESCE((v_b->>'expenses_total')::numeric, 0),
      'adjustments_total', COALESCE((v_b->>'adjustments_total')::numeric, 0),
      'total', v_total,
      'advance', v_adv,
      'second_payment', round(v_total - v_adv, 2),
      'notes', v_b->>'notes'
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'company_id', _company_id,
    'period', jsonb_build_object('year', _year, 'month', _month),
    'currency', COALESCE(v_base->>'currency', 'EUR'),
    'generated_at', now(),
    'employees', v_out
  );
END
$function$;

REVOKE ALL ON FUNCTION public.payroll_payment_summary(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_payment_summary(uuid, integer, integer) TO authenticated, service_role;

COMMIT;

SELECT jsonb_build_object(
  'funcao_criada', to_regprocedure('public.payroll_payment_summary(uuid,integer,integer)') IS NOT NULL,
  'folha_com_linhas', position('pay_lines' IN pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure)) > 0,
  'copia_guardada', (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'resumo_pagamento_20261115')
)::text AS resultado;
