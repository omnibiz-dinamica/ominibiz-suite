-- OmniBiz · DESFAZER resumo_pagamento_20261115_aplicar.sql (SUP-2026-000302):
-- apaga o resumo e repõe a folha sem summary.pay_lines.
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'resumo_pagamento_20261115') <> 1 THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia da folha (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DROP FUNCTION IF EXISTS public.payroll_payment_summary(uuid, integer, integer);
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'resumo_pagamento_20261115' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'resumo_pagamento_20261115';
COMMIT;
SELECT jsonb_build_object(
  'funcao_apagada', to_regprocedure('public.payroll_payment_summary(uuid,integer,integer)') IS NULL,
  'folha_reposta', position('pay_lines' IN pg_get_functiondef('public.timesheet_build_snapshot(uuid,uuid,integer,integer)'::regprocedure)) = 0
)::text AS resultado;
