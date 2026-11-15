-- OmniBiz · DESFAZER conferencia_alertas_20261115_aplicar.sql (SUP-2026-000299):
-- volta a regra antiga (qualquer diferença pede decisão; sem alertas de horário).
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_alertas_20261115') <> 1 THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia da função (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_alertas_20261115' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'conferencia_alertas_20261115';
COMMIT;
SELECT jsonb_build_object('regra_antiga_reposta', position('employee_note' IN pg_get_functiondef(
  'public.timesheet_reconciliation_rows(uuid,uuid,date,date)'::regprocedure)) = 0)::text AS resultado;
