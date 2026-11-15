-- OmniBiz · DESFAZER colegas_tarefa_20261115_aplicar.sql (SUP-2026-000242)
BEGIN;
DO $guard$
BEGIN
  IF to_regprocedure('public.my_task_colleagues(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'PARAR: a função não existe (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
DROP FUNCTION public.my_task_colleagues(uuid[]);
COMMIT;
SELECT jsonb_build_object('funcao_apagada', to_regprocedure('public.my_task_colleagues(uuid[])') IS NULL)::text AS resultado;
