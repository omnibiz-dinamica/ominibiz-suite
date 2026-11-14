-- =====================================================================
-- OmniBiz · 14/11/2026 — Folha paga pelo valor do FUNCIONÁRIO
-- (pedido do Marco: "não pode ser o valor do cliente"). Desfazer:
-- pagamento_funcionario_20261114_desfazer.sql
--
-- Decisões do dono (Eduardo, 14/11/2026):
--  • Valor ÚNICO do funcionário, não muda por cliente. O cliente deixa de
--    definir forma e valor. Sem valor no cadastro do funcionário → padrão da
--    empresa (hoje 0 na V-clean): a folha avisa "sem valor no cadastro".
--  • Fim de semana (sábado e domingo) E feriados usam o "Valor hora — fim de
--    semana/feriado" do funcionário; sem esse valor, usa o da semana.
--  • O dia é o DIA DA TAREFA (turno de sábado 23:30–03:00 conta no sábado).
--  • Feriados: Bélgica (empresas no fuso Europe/Brussels) e Portugal
--    (Europe/Lisbon), calculados (incluem os móveis, a partir da Páscoa).
--  • Exceção mantida: FOLGA REMUNERADA continua a seguir o cliente
--    "FOLGA REMUNERADA" (Fixo 50 €, 0 h), como decidido em 10/11.
--  • Diária do funcionário: UMA por dia (a "uma por cliente por dia" só vale
--    quando a forma vem do cliente, ou seja, a folga).
--  • A folha passa a ter summary.by_day_type: horas e valor de semana e de
--    fim de semana/feriado.
--  • Recalcula os pontos desde 01/10/2026 SÓ de meses não assinados/fechados.
--    Folhas assinadas (versões gravadas) nunca mudam.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_funcionario_20261114') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF to_regclass('public._omnibiz_revert_20261114_valuations') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: a cópia das valorações já existe. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.omnibiz_day_type(date,text)') IS NOT NULL
     OR to_regprocedure('public.omnibiz_easter(integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: as funções de feriados já existem. Nada foi alterado.';
  END IF;
  -- resolve_billing_rule tem de ser exatamente a versão de 10/11 (lida em 14/11)
  IF md5(pg_get_functiondef('public.resolve_billing_rule(uuid)'::regprocedure)) <> 'd74167e69b9622e7aef5cfaea17a86f4' THEN
    RAISE EXCEPTION 'PARAR: resolve_billing_rule mudou desde 14/11. Nada foi alterado.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name IN ('rate_hour_week', 'rate_hour_weekend', 'rate_day_be', 'manual_hour_rate', 'manual_hourly_rate')) <> 5 THEN
    RAISE EXCEPTION 'PARAR: faltam colunas de valor no cadastro do funcionário. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure),
    'AND v\.pay_model_used = ''daily'' AND v\.client_id IS NOT DISTINCT FROM te\.client_id', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: calculate_time_entry_value (diária) diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure),
    'IF v_minutes IS DISTINCT FROM te\.effective_minutes THEN', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: calculate_time_entry_value (conferência) diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure),
    '\(te\.started_at AT TIME ZONE v_tz\)::date AS work_day', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: timesheet_build_snapshot (dia) diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure),
    'LEFT JOIN public\.clients cl ON cl\.id = v\.client_id', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: timesheet_build_snapshot (clientes) diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure),
    '\)\s*x\)\s*INTO\s+v_amount,\s*v_currency,\s*v_pay_model,\s*v_rate,\s*v_rate_source,\s*v_by_client\s*FROM vv;', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: timesheet_build_snapshot (resumo) diferente do esperado (%). Nada foi alterado.', n; END IF;
  SELECT count(*) INTO n FROM regexp_matches(pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure),
    '''by_client'', v_by_client\)', 'g');
  IF n <> 1 THEN RAISE EXCEPTION 'PARAR: timesheet_build_snapshot (by_client) diferente do esperado (%). Nada foi alterado.', n; END IF;
END
$guard$;

-- Cópia das funções atuais (para desfazer)
INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'pagamento_funcionario_20261114', f, pg_get_functiondef(f::regprocedure), md5(pg_get_functiondef(f::regprocedure))
FROM unnest(ARRAY['public.resolve_billing_rule(uuid)',
                  'public.calculate_time_entry_value(uuid)',
                  'public.timesheet_build_snapshot(uuid,uuid,integer,integer)']) AS f;

-- ---------------------------------------------------------------------
-- 1) Feriados e tipo de dia
-- ---------------------------------------------------------------------
CREATE FUNCTION public.omnibiz_easter(_y integer)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $f$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; dy int;
BEGIN
  -- Domingo de Páscoa (calendário gregoriano, algoritmo anónimo)
  a := _y % 19; b := _y / 100; c := _y % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mo := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(_y, mo, dy);
END $f$;

-- 'week' | 'weekend' | 'holiday'. Feriados pelo fuso da empresa (BE / PT).
CREATE FUNCTION public.omnibiz_day_type(_d date, _tz text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $f$
DECLARE y int; ea date; md text;
BEGIN
  IF _d IS NULL THEN RETURN NULL; END IF;
  y := EXTRACT(YEAR FROM _d)::int; ea := public.omnibiz_easter(y); md := to_char(_d, 'MM-DD');
  IF _tz = 'Europe/Brussels' AND (
       md IN ('01-01', '05-01', '07-21', '08-15', '11-01', '11-11', '12-25')
       OR _d IN (ea + 1, ea + 39, ea + 50)) THEN
    RETURN 'holiday';
  END IF;
  IF _tz = 'Europe/Lisbon' AND (
       md IN ('01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25')
       OR _d IN (ea - 2, ea, ea + 60)) THEN
    RETURN 'holiday';
  END IF;
  RETURN CASE WHEN EXTRACT(ISODOW FROM _d) IN (6, 7) THEN 'weekend' ELSE 'week' END;
END $f$;
GRANT EXECUTE ON FUNCTION public.omnibiz_easter(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.omnibiz_day_type(date, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) resolve_billing_rule: valor do funcionário (exceção: folga remunerada)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_billing_rule(_time_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  te record;
  prof public.profiles%ROWTYPE;
  cli public.clients%ROWTYPE;
  hr public.company_hr_settings%ROWTYPE;
  comp public.companies%ROWTYPE;
  v_model text; v_model_src text;
  v_hour numeric; v_hour_src text;
  v_fixed numeric; v_fixed_src text;
  v_daily numeric; v_daily_src text;
  v_monthly numeric; v_monthly_src text;
  v_primary_src text;
  v_tz text; v_work_day date; v_day_type text;
  v_week numeric; v_weekend numeric;
  v_mixed_base numeric; v_mixed_extra numeric; v_mixed_incl int;
BEGIN
  SELECT t.*, ta.client_id, ta.recurrence_date AS task_recurrence_date, ta.scheduled_for AS task_scheduled_for
    INTO te
  FROM time_entries t LEFT JOIN tasks ta ON ta.id = t.task_id
  WHERE t.id = _time_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'time_entry % not found', _time_entry_id; END IF;

  SELECT * INTO prof FROM profiles WHERE id = te.user_id;
  SELECT * INTO comp FROM companies WHERE id = te.company_id;
  SELECT * INTO hr FROM company_hr_settings WHERE company_id = te.company_id;
  IF te.client_id IS NOT NULL THEN
    SELECT * INTO cli FROM clients WHERE id = te.client_id;
  END IF;

  -- 14/11/2026: dia da TAREFA (turno da noite conta no dia em que começa a tarefa)
  v_tz := COALESCE(NULLIF(comp.timezone, ''), 'UTC');
  v_work_day := COALESCE(te.task_recurrence_date,
                         (te.task_scheduled_for AT TIME ZONE 'UTC')::date,
                         (te.started_at AT TIME ZONE v_tz)::date);
  v_day_type := public.omnibiz_day_type(v_work_day, v_tz);

  IF lower(btrim(COALESCE(cli.name, ''))) = 'folga remunerada' THEN
    -- Exceção (10/11): a folga remunerada segue o cliente "FOLGA REMUNERADA".
    IF cli.billing_mode IN ('hourly', 'daily', 'fixed', 'monthly', 'mixed') THEN
      v_model := cli.billing_mode; v_model_src := 'client';
    ELSE
      v_model := COALESCE(NULLIF(prof.pay_model, ''), 'hourly'); v_model_src := 'employee';
    END IF;
    IF cli.hourly_rate IS NOT NULL THEN v_hour := cli.hourly_rate; v_hour_src := 'client';
    ELSE v_hour := COALESCE(hr.default_hour_rate, 0); v_hour_src := 'company_default'; END IF;
    IF cli.fixed_rate IS NOT NULL THEN v_fixed := cli.fixed_rate; v_fixed_src := 'client';
    ELSE v_fixed := COALESCE(hr.default_fixed_rate, 0); v_fixed_src := 'company_default'; END IF;
    IF cli.daily_rate IS NOT NULL THEN v_daily := cli.daily_rate; v_daily_src := 'client';
    ELSE v_daily := COALESCE(hr.default_daily_rate, 0); v_daily_src := 'company_default'; END IF;
    IF cli.monthly_rate IS NOT NULL THEN v_monthly := cli.monthly_rate; v_monthly_src := 'client';
    ELSE v_monthly := COALESCE(hr.default_monthly_rate, 0); v_monthly_src := 'company_default'; END IF;
    v_mixed_base := COALESCE(cli.mixed_base_fixed, hr.default_mixed_base_fixed, 0);
    v_mixed_extra := COALESCE(cli.mixed_extra_hour_rate, hr.default_mixed_extra_hour_rate, 0);
    v_mixed_incl := COALESCE(cli.mixed_included_minutes, hr.default_mixed_included_minutes, 0);
  ELSE
    -- 14/11/2026: forma e valor do FUNCIONÁRIO; o cliente não entra.
    v_model := COALESCE(NULLIF(prof.pay_model, ''), 'hourly'); v_model_src := 'employee';

    v_week := COALESCE(NULLIF(prof.manual_hour_rate, 0), NULLIF(prof.manual_hourly_rate, 0), NULLIF(prof.rate_hour_week, 0));
    v_weekend := COALESCE(NULLIF(prof.rate_hour_weekend, 0), v_week);
    v_hour := CASE WHEN v_day_type IN ('weekend', 'holiday') THEN v_weekend ELSE v_week END;
    IF v_hour IS NOT NULL THEN v_hour_src := 'employee_manual';
    ELSE v_hour := COALESCE(hr.default_hour_rate, 0); v_hour_src := 'company_default'; END IF;

    IF prof.manual_fixed_rate IS NOT NULL THEN v_fixed := prof.manual_fixed_rate; v_fixed_src := 'employee_manual';
    ELSE v_fixed := COALESCE(hr.default_fixed_rate, 0); v_fixed_src := 'company_default'; END IF;

    IF COALESCE(prof.manual_daily_rate, NULLIF(prof.rate_day_be, 0)) IS NOT NULL THEN
      v_daily := COALESCE(prof.manual_daily_rate, NULLIF(prof.rate_day_be, 0)); v_daily_src := 'employee_manual';
    ELSE v_daily := COALESCE(hr.default_daily_rate, 0); v_daily_src := 'company_default'; END IF;

    IF prof.manual_monthly_rate IS NOT NULL THEN v_monthly := prof.manual_monthly_rate; v_monthly_src := 'employee_manual';
    ELSE v_monthly := COALESCE(hr.default_monthly_rate, 0); v_monthly_src := 'company_default'; END IF;

    v_mixed_base := COALESCE(prof.manual_mixed_base_fixed, hr.default_mixed_base_fixed, 0);
    v_mixed_extra := COALESCE(prof.manual_mixed_extra_hour_rate, hr.default_mixed_extra_hour_rate, 0);
    v_mixed_incl := COALESCE(prof.manual_mixed_included_minutes, hr.default_mixed_included_minutes, 0);
  END IF;

  v_primary_src := CASE v_model
    WHEN 'hourly' THEN v_hour_src
    WHEN 'fixed' THEN v_fixed_src
    WHEN 'daily' THEN v_daily_src
    WHEN 'monthly' THEN v_monthly_src
    ELSE v_hour_src END;

  RETURN jsonb_build_object(
    'pay_model', v_model, 'model_source', v_model_src,
    'rate_source', v_primary_src,
    'hour_rate', v_hour,
    'hour_rate_source', v_hour_src,
    'fixed_rate', v_fixed,
    'fixed_rate_source', v_fixed_src,
    'daily_rate', v_daily,
    'daily_rate_source', v_daily_src,
    'monthly_rate', v_monthly,
    'monthly_rate_source', v_monthly_src,
    'mixed_base', v_mixed_base,
    'mixed_extra_rate', v_mixed_extra,
    'mixed_included_minutes', v_mixed_incl,
    'work_day', v_work_day,
    'day_type', v_day_type,
    'currency', COALESCE(comp.currency, 'EUR')
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) calculate_time_entry_value: diária do funcionário 1x por dia; dia no detalhe
-- ---------------------------------------------------------------------
DO $p3$
DECLARE d text := pg_get_functiondef('public.calculate_time_entry_value(uuid)'::regprocedure); n text;
BEGIN
  n := regexp_replace(d, 'AND v\.pay_model_used = ''daily'' AND v\.client_id IS NOT DISTINCT FROM te\.client_id',
    'AND v.pay_model_used = ''daily'' AND (COALESCE(rule->>''model_source'', ''employee'') <> ''client'' OR v.client_id IS NOT DISTINCT FROM te.client_id)');
  n := regexp_replace(n, 'IF v_minutes IS DISTINCT FROM te\.effective_minutes THEN',
$r$-- 14/11/2026: dia da tarefa e tipo de dia (semana / fim de semana / feriado)
v_breakdown := COALESCE(v_breakdown, '{}'::jsonb) || jsonb_build_object(
  'task_day', rule->>'work_day', 'day_type', rule->>'day_type', 'model_source', rule->>'model_source');
IF v_minutes IS DISTINCT FROM te.effective_minutes THEN$r$);
  IF n = d OR position('<> ''client'' OR v.client_id' IN n) = 0 OR position('''day_type'', rule->>''day_type''' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: troca em calculate_time_entry_value falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p3$;

-- ---------------------------------------------------------------------
-- 4) timesheet_build_snapshot: horas e valor de semana / fim de semana
-- ---------------------------------------------------------------------
DO $p4$
DECLARE d text := pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure); n text;
BEGIN
  n := regexp_replace(d, 'v_by_client jsonb := ''\[\]''::jsonb;',
    'v_by_client jsonb := ''[]''::jsonb; v_by_daytype jsonb := ''{}''::jsonb;');
  n := regexp_replace(n, '\(te\.started_at AT TIME ZONE v_tz\)::date AS work_day',
$r$(te.started_at AT TIME ZONE v_tz)::date AS work_day,
           -- 14/11/2026: dia da TAREFA e tipo de dia (semana / fim de semana / feriado)
           COALESCE(ta.recurrence_date, (ta.scheduled_for AT TIME ZONE 'UTC')::date,
                    (te.started_at AT TIME ZONE v_tz)::date) AS task_day,
           public.omnibiz_day_type(COALESCE(ta.recurrence_date, (ta.scheduled_for AT TIME ZONE 'UTC')::date,
                    (te.started_at AT TIME ZONE v_tz)::date), v_tz) AS day_type$r$);
  n := regexp_replace(n, 'LEFT JOIN public\.clients cl ON cl\.id = v\.client_id',
    'LEFT JOIN public.clients cl ON cl.id = v.client_id
    LEFT JOIN public.tasks ta ON ta.id = te.task_id');
  n := regexp_replace(n,
    '\)\s*x\)\s*INTO\s+v_amount,\s*v_currency,\s*v_pay_model,\s*v_rate,\s*v_rate_source,\s*v_by_client\s*FROM vv;',
$r$) x),
         (SELECT jsonb_build_object(
                   'week_minutes', COALESCE(SUM(w.effective_minutes) FILTER (WHERE w.day_type = 'week'), 0),
                   'weekend_minutes', COALESCE(SUM(w.effective_minutes) FILTER (WHERE w.day_type IN ('weekend', 'holiday')), 0),
                   'holiday_minutes', COALESCE(SUM(w.effective_minutes) FILTER (WHERE w.day_type = 'holiday'), 0),
                   'week_days', COUNT(DISTINCT w.task_day) FILTER (WHERE w.day_type = 'week'),
                   'weekend_days', COUNT(DISTINCT w.task_day) FILTER (WHERE w.day_type IN ('weekend', 'holiday')),
                   'week_amount', COALESCE(SUM(w.amount) FILTER (WHERE w.day_type = 'week'), 0),
                   'weekend_amount', COALESCE(SUM(w.amount) FILTER (WHERE w.day_type IN ('weekend', 'holiday')), 0),
                   'holidays', COALESCE((SELECT jsonb_agg(DISTINCT w2.task_day) FROM vv w2 WHERE w2.day_type = 'holiday'), '[]'::jsonb))
          FROM vv w)
  INTO v_amount, v_currency, v_pay_model, v_rate, v_rate_source, v_by_client, v_by_daytype
  FROM vv;$r$);
  n := regexp_replace(n, '''by_client'', v_by_client\)', '''by_client'', v_by_client, ''by_day_type'', v_by_daytype)');
  IF n = d OR position('v_by_daytype jsonb' IN n) = 0 OR position('''by_day_type'', v_by_daytype' IN n) = 0
     OR position('LEFT JOIN public.tasks ta ON ta.id = te.task_id' IN n) = 0
     OR position('AS day_type' IN n) = 0 OR position('v_by_client, v_by_daytype' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: troca em timesheet_build_snapshot falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p4$;

-- ---------------------------------------------------------------------
-- 5) Recalcular pontos desde 01/10/2026 em meses NÃO assinados/fechados
-- ---------------------------------------------------------------------
CREATE TABLE public._omnibiz_revert_20261114_valuations AS
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
ALTER TABLE public._omnibiz_revert_20261114_valuations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._omnibiz_revert_20261114_valuations FROM PUBLIC, anon, authenticated;

DELETE FROM public.time_entry_valuations v
USING public._omnibiz_revert_20261114_valuations b
WHERE v.time_entry_id = b.time_entry_id;

DO $p5$
DECLARE r record; k int := 0;
BEGIN
  FOR r IN
    SELECT te.id FROM public.time_entries te
    JOIN public._omnibiz_revert_20261114_valuations b ON b.time_entry_id = te.id
    ORDER BY te.started_at, te.id
  LOOP
    PERFORM public.calculate_time_entry_value(r.id);
    k := k + 1;
  END LOOP;
  RAISE NOTICE 'recalculados: %', k;
END
$p5$;

COMMIT;

-- Resultado (só leitura)
SELECT jsonb_pretty(jsonb_build_object(
  'recalculados', (SELECT count(*) FROM public._omnibiz_revert_20261114_valuations),
  'sem_valoracao_depois', (SELECT count(*) FROM public._omnibiz_revert_20261114_valuations b
                           WHERE NOT EXISTS (SELECT 1 FROM public.time_entry_valuations v WHERE v.time_entry_id = b.time_entry_id)),
  'vclean_out_antes', (SELECT round(sum(b.amount), 2) FROM public._omnibiz_revert_20261114_valuations b
      JOIN public.time_entries te ON te.id = b.time_entry_id
      WHERE b.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND te.started_at < '2026-11-01'),
  'vclean_out_depois', (SELECT round(sum(v.amount), 2) FROM public.time_entry_valuations v
      JOIN public._omnibiz_revert_20261114_valuations b ON b.time_entry_id = v.time_entry_id
      JOIN public.time_entries te ON te.id = v.time_entry_id
      WHERE v.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND te.started_at < '2026-11-01'),
  'vclean_sem_valor_no_cadastro', (SELECT count(*) FROM public.profiles p
      JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'employee'
      WHERE r.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
        AND COALESCE(NULLIF(p.manual_hour_rate, 0), NULLIF(p.manual_hourly_rate, 0), NULLIF(p.rate_hour_week, 0),
                     p.manual_daily_rate, p.manual_monthly_rate, p.manual_fixed_rate) IS NULL),
  'feriados_be_2026', (SELECT jsonb_agg(d::date) FROM generate_series(date '2026-01-01', date '2026-12-31', interval '1 day') d
      WHERE public.omnibiz_day_type(d::date, 'Europe/Brussels') = 'holiday'),
  'funcoes_trocadas', (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'pagamento_funcionario_20261114')
)) AS resultado;
