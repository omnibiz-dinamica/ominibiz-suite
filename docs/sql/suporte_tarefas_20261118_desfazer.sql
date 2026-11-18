-- OmniBiz · DESFAZER suporte_tarefas_20261118_aplicar.sql
-- Repõe as 3 funções, apaga a função auxiliar e os destinos Léa/Luc.
-- Se algum ticket estiver em Léa/Luc, reencaminhe-o antes (senão PARA).
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'suporte_tarefas_20261118') <> 3 THEN
    RAISE EXCEPTION 'PARAR: não encontrei as cópias das funções (o aplicar não correu?). Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.support_tickets WHERE destination_code IN ('lea','luc')) THEN
    RAISE EXCEPTION 'PARAR: há tickets com destino Léa/Luc; reencaminhe-os antes de desfazer. Nada foi alterado.';
  END IF;
END
$guard$;
DO $r$
DECLARE b record;
BEGIN
  FOR b IN SELECT def FROM public._omnibiz_fn_backup WHERE tag = 'suporte_tarefas_20261118' LOOP
    EXECUTE b.def;
  END LOOP;
END
$r$;
DROP FUNCTION IF EXISTS public._support_dest_reaches_managers(uuid, text);
DELETE FROM public.support_destinations WHERE code IN ('lea','luc');
ALTER TABLE public.support_destinations DROP COLUMN IF EXISTS company_id;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'suporte_tarefas_20261118';
COMMIT;
SELECT jsonb_build_object(
  'funcoes_repostas', position('SUP-298' IN pg_get_functiondef('public.create_support_ticket'::regproc)) = 0,
  'destinos_removidos', NOT EXISTS (SELECT 1 FROM public.support_destinations WHERE code IN ('lea','luc'))
)::text AS resultado;
