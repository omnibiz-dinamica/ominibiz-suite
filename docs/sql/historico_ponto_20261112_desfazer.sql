-- OmniBiz · DESFAZER historico_aplicar.sql (12/11/2026): remove a função de leitura.
BEGIN;
DROP FUNCTION IF EXISTS public.my_punch_history(uuid, date, date);
COMMIT;
SELECT (to_regprocedure('public.my_punch_history(uuid,date,date)') IS NULL)::text AS funcao_removida;
