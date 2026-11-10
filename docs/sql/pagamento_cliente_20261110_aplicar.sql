-- =====================================================================
-- OmniBiz · 10/11/2026 — Folha calculada pela forma de pagamento do CLIENTE
-- Desfazer: pagamento_desfazer.sql
--
-- Decisões do dono (Eduardo):
--  • A forma de pagamento é a do CLIENTE (hora / dia / mês / fixo / misto).
--    Sem forma válida no cliente → a do funcionário. Exceção: funcionário com
--    salário MENSAL no cadastro continua mensal.
--  • Valores: valor manual do funcionário (exceção) > cliente > padrão da empresa
--    (igual a hoje).
--  • Diária: UMA por cliente por dia (antes: uma por dia no total).
--  • Fixo: UMA vez por tarefa (antes: por cada ponto).
--  • Mensal do cliente: UMA vez por mês por cliente.
--  • Folga remunerada: segue o cliente "FOLGA REMUNERADA" (Fixo 50 €, 0 h).
--  • A folha passa a ter o total POR CLIENTE (summary.by_client); quando há
--    formas diferentes no mês o tipo fica "multiple" (não mostra um valor/hora falso).
--  • Recalcula os pontos desde 01/10/2026 SÓ de meses não assinados/fechados.
--    Folhas assinadas (versões gravadas) nunca mudam.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_cliente_20261110') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF to_regclass('public._omnibiz_revert_20261110_valuations') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: a cópia das valorações já existe. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'time_entry_valuations_pay_model_used_check'
                   AND pg_get_constraintdef(oid) LIKE '%daily%' AND pg_get_constraintdef(oid) LIKE '%monthly%') THEN
    RAISE EXCEPTION 'PARAR: a tabela de valorações não aceita daily/monthly. Nada foi alterado.';
  END IF;
  -- os três trechos a trocar têm de existir exatamente uma vez
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.resolve_billing_rule(uuid)'::regprocedure),
    'v_model\s*:=\s*COALESCE\(prof\.pay_model,\s*cli\.billing_mode,\s*''hourly''\);', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: resolve_billing_rule diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure),
    'AND v\.pay_model_used = ''daily''', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: calculate_time_entry_value (diária) diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure),
    'ELSIF v_model = ''fixed'' THEN\s*v_amount := v_fixed;', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: calculate_time_entry_value (fixo) diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure),
    'ELSIF v_model = ''monthly'' THEN\s*v_amount := 0;', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: calculate_time_entry_value (mensal) diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure),
    'MAX\(COALESCE\(v\.rate_applied, v\.daily_applied, v\.monthly_applied\)\)', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: timesheet_build_snapshot diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure),
    '''currency'',\s*v_currency\s*\)\s*,\s*''generated_at''', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: timesheet_build_snapshot (resumo) diferente do esperado (%). Nada foi alterado.', n; END IF;
END
$guard$;

-- Cópia das funções atuais (para desfazer)
INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'pagamento_cliente_20261110', f, pg_get_functiondef(f::regprocedure), md5(pg_get_functiondef(f::regprocedure))
FROM unnest(ARRAY['public.resolve_billing_rule(uuid)',
                  'public.calculate_time_entry_value(uuid)',
                  'public.timesheet_build_snapshot(uuid,uuid,integer,integer)']) AS f;

-- ---------------------------------------------------------------------
-- 1) resolve_billing_rule: a forma é a do cliente
-- ---------------------------------------------------------------------
DO $p1$
DECLARE d text := pg_get_functiondef('public.resolve_billing_rule(uuid)'::regprocedure); n text;
BEGIN
  n := regexp_replace(d, 'v_model\s+text;', 'v_model text; v_model_src text;');
  n := regexp_replace(n, 'v_model\s*:=\s*COALESCE\(prof\.pay_model,\s*cli\.billing_mode,\s*''hourly''\);',
$r$-- 10/11/2026: a forma de pagamento é a do CLIENTE; salário mensal do funcionário é exceção.
  IF prof.pay_model = 'monthly' THEN
    v_model := 'monthly'; v_model_src := 'employee';
  ELSIF cli.billing_mode IN ('hourly', 'daily', 'fixed', 'monthly', 'mixed') THEN
    v_model := cli.billing_mode; v_model_src := 'client';
  ELSE
    v_model := COALESCE(NULLIF(prof.pay_model, ''), 'hourly'); v_model_src := 'employee';
  END IF;$r$);
  n := regexp_replace(n, '''pay_model'',\s*v_model,', '''pay_model'', v_model, ''model_source'', v_model_src,');
  IF n = d OR position('v_model_src text' IN n) = 0 OR position('''model_source''' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: troca em resolve_billing_rule falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p1$;

-- ---------------------------------------------------------------------
-- 2) calculate_time_entry_value: diária por cliente, fixo por tarefa, mensal do cliente 1x/mês
-- ---------------------------------------------------------------------
DO $p2$
DECLARE d text := pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure); n text;
BEGIN
  n := regexp_replace(d, 'AND v\.pay_model_used = ''daily''',
    'AND v.pay_model_used = ''daily'' AND v.client_id IS NOT DISTINCT FROM te.client_id');
  n := regexp_replace(n, 'ELSIF v_model = ''fixed'' THEN\s*v_amount := v_fixed;',
$r$ELSIF v_model = 'fixed' THEN
    -- 10/11/2026: valor fixo uma vez por tarefa (não por cada ponto)
    IF te.task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM time_entry_valuations v JOIN time_entries t2 ON t2.id = v.time_entry_id
      WHERE t2.task_id = te.task_id AND v.time_entry_id <> _time_entry_id
        AND v.pay_model_used = 'fixed' AND v.amount > 0 AND t2.voided_at IS NULL
    ) THEN
      v_amount := 0;
    ELSE
      v_amount := COALESCE(v_fixed, 0);
    END IF;$r$);
  n := regexp_replace(n, 'ELSIF v_model = ''monthly'' THEN\s*v_amount := 0;',
$r$ELSIF v_model = 'monthly' THEN
    -- 10/11/2026: mensal do CLIENTE conta uma vez por mês por cliente;
    -- salário mensal do funcionário continua só no cabeçalho (0 por ponto).
    v_amount := 0;
    IF COALESCE(rule->>'model_source', 'employee') = 'client' THEN
      v_day := (te.started_at AT TIME ZONE v_timezone)::date;
      SELECT EXISTS (
        SELECT 1 FROM time_entry_valuations v JOIN time_entries t2 ON t2.id = v.time_entry_id
        WHERE v.user_id = te.user_id AND v.company_id = te.company_id
          AND v.client_id IS NOT DISTINCT FROM te.client_id
          AND v.pay_model_used = 'monthly' AND v.time_entry_id <> _time_entry_id AND v.amount > 0
          AND t2.voided_at IS NULL
          AND date_trunc('month', (t2.started_at AT TIME ZONE v_timezone)) = date_trunc('month', v_day::timestamp)
      ) INTO v_day_already_paid;
      v_amount := CASE WHEN v_day_already_paid THEN 0 ELSE COALESCE(v_monthly, 0) END;
    END IF;$r$);
  IF n = d OR position('v.client_id IS NOT DISTINCT FROM te.client_id' IN n) = 0
     OR position('uma vez por tarefa' IN n) = 0 OR position('uma vez por mês por cliente' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: troca em calculate_time_entry_value falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p2$;

-- ---------------------------------------------------------------------
-- 3) timesheet_build_snapshot: total por cliente + tipo "multiple"
-- ---------------------------------------------------------------------
DO $p3$
DECLARE d text := pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure); n text;
BEGIN
  n := regexp_replace(d, 'v_tz\s+text;', 'v_tz text; v_by_client jsonb := ''[]''::jsonb;');
  n := regexp_replace(n,
    'SELECT\s+COALESCE\(SUM\(v\.amount\),\s*0\),\s*COALESCE\(MAX\(v\.currency\),\s*''EUR''\),\s*MAX\(v\.pay_model_used\),\s*MAX\(COALESCE\(v\.rate_applied, v\.daily_applied, v\.monthly_applied\)\),\s*MAX\(v\.rate_source\)\s*INTO\s+v_amount,\s*v_currency,\s*v_pay_model,\s*v_rate,\s*v_rate_source\s*FROM\s+public\.time_entry_valuations\s+v\s+JOIN\s+public\.time_entries\s+te\s+ON\s+te\.id\s*=\s*v\.time_entry_id\s+WHERE\s+v\.company_id\s*=\s*_company_id\s+AND\s+v\.user_id\s*=\s*_employee_id\s+AND\s+te\.voided_at\s+IS\s+NULL\s+AND\s+te\.started_at\s*>=\s*v_from\s+AND\s+te\.started_at\s*<\s*v_to;',
$r$-- 10/11/2026: total por cliente; com formas diferentes o tipo fica "multiple"
  WITH vv AS (
    SELECT v.amount, v.currency, v.pay_model_used, v.rate_source, v.client_id, v.effective_minutes,
           CASE v.pay_model_used WHEN 'hourly' THEN v.rate_applied WHEN 'daily' THEN v.daily_applied
                WHEN 'monthly' THEN v.monthly_applied WHEN 'fixed' THEN v.fixed_applied
                ELSE v.rate_applied END AS unit_rate,
           cl.name AS client_name,
           (te.started_at AT TIME ZONE v_tz)::date AS work_day
    FROM public.time_entry_valuations v
    JOIN public.time_entries te ON te.id = v.time_entry_id
    LEFT JOIN public.clients cl ON cl.id = v.client_id
    WHERE v.company_id = _company_id
      AND v.user_id = _employee_id
      AND te.voided_at IS NULL
      AND te.started_at >= v_from
      AND te.started_at < v_to
  )
  SELECT COALESCE(SUM(vv.amount), 0),
         COALESCE(MAX(vv.currency), 'EUR'),
         CASE WHEN COUNT(DISTINCT vv.pay_model_used) > 1 THEN 'multiple' ELSE MAX(vv.pay_model_used) END,
         CASE WHEN COUNT(DISTINCT vv.pay_model_used) > 1 OR COUNT(DISTINCT vv.unit_rate) > 1 THEN NULL
              ELSE MAX(vv.unit_rate) END,
         CASE WHEN COUNT(DISTINCT vv.rate_source) > 1 THEN 'multiple' ELSE MAX(vv.rate_source) END,
         (SELECT COALESCE(jsonb_agg(x.o ORDER BY x.o->>'client_name', x.o->>'pay_model'), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object(
                     'client_id', g.client_id,
                     'client_name', COALESCE(g.client_name, 'Sem cliente'),
                     'pay_model', g.pay_model_used,
                     'unit_rate', CASE WHEN COUNT(DISTINCT g.unit_rate) > 1 THEN NULL ELSE MAX(g.unit_rate) END,
                     'minutes', COALESCE(SUM(g.effective_minutes), 0),
                     'entries', COUNT(*),
                     'days', COUNT(DISTINCT g.work_day),
                     'amount', COALESCE(SUM(g.amount), 0)) AS o
            FROM vv g
            GROUP BY g.client_id, g.client_name, g.pay_model_used
          ) x)
  INTO v_amount, v_currency, v_pay_model, v_rate, v_rate_source, v_by_client
  FROM vv;$r$);
  n := regexp_replace(n, '''currency'',\s*v_currency\s*\)\s*,\s*''generated_at''',
    '''currency'', v_currency, ''by_client'', v_by_client),
''generated_at''');
  IF n = d OR position('v_by_client jsonb' IN n) = 0 OR position('''by_client'', v_by_client' IN n) = 0
     OR position('WITH vv AS' IN n) = 0
     OR position('COALESCE(v_comp->>''currency'', v_currency)' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: troca em timesheet_build_snapshot falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p3$;

-- ---------------------------------------------------------------------
-- 4) Recalcular pontos desde 01/10/2026 em meses NÃO assinados/fechados
-- ---------------------------------------------------------------------
CREATE TABLE public._omnibiz_revert_20261110_valuations AS
SELECT v.*
FROM public.time_entry_valuations v
JOIN public.time_entries te ON te.id = v.time_entry_id
JOIN public.companies c ON c.id = te.company_id
WHERE te.started_at >= timestamptz '2026-10-01 00:00+00' - interval '1 day'
  AND (te.started_at AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'Europe/Lisbon'))::date >= date '2026-10-01'
  AND NOT EXISTS (
    SELECT 1 FROM public.timesheet_periods p
    WHERE p.company_id = te.company_id AND p.employee_id = te.user_id
      AND p.period_year = EXTRACT(YEAR FROM te.started_at AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'Europe/Lisbon'))::int
      AND p.period_month = EXTRACT(MONTH FROM te.started_at AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'Europe/Lisbon'))::int
      AND (p.current_version > 0 OR p.status::text IN ('assinado_funcionario', 'em_conferencia', 'fechado_gestor', 'disponivel_contabilidade')));
ALTER TABLE public._omnibiz_revert_20261110_valuations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._omnibiz_revert_20261110_valuations FROM PUBLIC, anon, authenticated;

DELETE FROM public.time_entry_valuations v
USING public._omnibiz_revert_20261110_valuations b
WHERE v.time_entry_id = b.time_entry_id;

DO $p4$
DECLARE r record; k int := 0;
BEGIN
  FOR r IN
    SELECT te.id FROM public.time_entries te
    JOIN public._omnibiz_revert_20261110_valuations b ON b.time_entry_id = te.id
    ORDER BY te.started_at, te.id
  LOOP
    PERFORM public.calculate_time_entry_value(r.id);
    k := k + 1;
  END LOOP;
  RAISE NOTICE 'recalculados: %', k;
END
$p4$;

COMMIT;

-- Resultado (só leitura)
SELECT jsonb_pretty(jsonb_build_object(
  'recalculados', (SELECT count(*) FROM public._omnibiz_revert_20261110_valuations),
  'sem_valoracao_depois', (SELECT count(*) FROM public._omnibiz_revert_20261110_valuations b
                           WHERE NOT EXISTS (SELECT 1 FROM public.time_entry_valuations v WHERE v.time_entry_id = b.time_entry_id)),
  'vclean_out_antes', (SELECT jsonb_object_agg(k, n) FROM (SELECT pay_model_used || ' ' || round(sum(amount), 2) || '€' AS k, count(*) n
      FROM public._omnibiz_revert_20261110_valuations b JOIN public.time_entries te ON te.id = b.time_entry_id
      WHERE b.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND te.started_at < '2026-11-01' GROUP BY pay_model_used) x),
  'vclean_out_depois', (SELECT jsonb_object_agg(k, n) FROM (SELECT v.pay_model_used || ' ' || round(sum(v.amount), 2) || '€' AS k, count(*) n
      FROM public.time_entry_valuations v JOIN public._omnibiz_revert_20261110_valuations b ON b.time_entry_id = v.time_entry_id
      JOIN public.time_entries te ON te.id = v.time_entry_id
      WHERE v.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND te.started_at < '2026-11-01' GROUP BY v.pay_model_used) y),
  'folgas_out', (SELECT count(*) || ' folgas, ' || round(sum(v.amount), 2) || '€'
      FROM public.time_entry_valuations v JOIN public.clients cl ON cl.id = v.client_id
      JOIN public.time_entries te ON te.id = v.time_entry_id
      WHERE v.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND lower(btrim(cl.name)) = 'folga remunerada'
        AND te.started_at >= '2026-10-01' AND te.started_at < '2026-11-01'),
  'salario_mensal_funcionarios', (SELECT count(*) FROM public.profiles WHERE pay_model = 'monthly'),
  'funcoes_trocadas', (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_cliente_20261110')
)) AS resultado;
