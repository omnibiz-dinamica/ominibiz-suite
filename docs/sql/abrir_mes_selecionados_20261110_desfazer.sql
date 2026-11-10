-- =====================================================================
-- OmniBiz · DESFAZER abrir_mes_aplicar.sql (10/11/2026)
-- Repõe os 134 avisos e os 71 períodos (com os registos de auditoria),
-- volta a permitir a função antiga timesheet_open_month, remove a nova
-- timesheet_open_month_for e repõe o comportamento anterior da conferência.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public._omnibiz_revert_20261110_notifications') IS NULL THEN
    RAISE EXCEPTION 'PARAR: não encontrei as cópias (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public.timesheet_periods SELECT * FROM public._omnibiz_revert_20261110_periods
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.timesheet_audit_events SELECT * FROM public._omnibiz_revert_20261110_audit
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.notifications SELECT * FROM public._omnibiz_revert_20261110_notifications
ON CONFLICT (id) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.timesheet_open_month(uuid, integer, integer) TO authenticated;
DROP FUNCTION IF EXISTS public.timesheet_open_month_for(uuid, integer, integer, uuid[]);

DO $patch$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)') IS NULL THEN RETURN; END IF;
  v_def := pg_get_functiondef('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)'::regprocedure);
  v_def := regexp_replace(v_def,
    'IF v_is_manager AND EXISTS \(SELECT 1 FROM public\.timesheet_periods tp\s+WHERE tp\.company_id = _company_id AND tp\.employee_id = _employee_id\s+AND tp\.period_year = EXTRACT\(YEAR FROM v_date\)::int AND tp\.period_month = EXTRACT\(MONTH FROM v_date\)::int\) THEN',
    'IF v_is_manager THEN');
  EXECUTE v_def;
END
$patch$;

DROP TABLE public._omnibiz_revert_20261110_notifications;
DROP TABLE public._omnibiz_revert_20261110_periods;
DROP TABLE public._omnibiz_revert_20261110_audit;

COMMIT;

SELECT jsonb_pretty(jsonb_build_object(
  'avisos_repostos', (SELECT count(*) FROM public.notifications WHERE company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
      AND event::text = 'timesheet_report_available'
      AND created_at IN ('2026-11-10 09:48:35.05303+00', '2026-11-10 10:37:42.699277+00')),
  'periodos_repostos', (SELECT count(*) FROM public.timesheet_periods WHERE company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
      AND created_at IN ('2026-11-10 09:48:35.05303+00', '2026-11-10 10:37:42.699277+00')),
  'funcao_antiga_liberada', has_function_privilege('authenticated', 'public.timesheet_open_month(uuid,integer,integer)', 'EXECUTE')
)) AS resultado;
