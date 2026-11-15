-- OmniBiz · DESFAZER falta_gestor_20261115_aplicar.sql (SUP-2026-000294):
-- volta a regra antiga (1h depois do início; sem hora, no dia seguinte).
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'falta_gestor_20261115') <> 1 THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia da função (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'falta_gestor_20261115' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'falta_gestor_20261115';
COMMIT;
SELECT jsonb_build_object('regra_antiga_reposta', position('ainda nao atingiu o horario permitido' IN pg_get_functiondef(
  (SELECT oid FROM pg_proc WHERE proname = 'task_mark_absent' AND pronamespace = 'public'::regnamespace))) > 0)::text AS resultado;
