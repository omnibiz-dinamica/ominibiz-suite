-- OmniBiz · DESFAZER indice_excluir_serie_20261122_aplicar.sql
-- Remove só o índice (a exclusão de séries volta a ser lenta).
DROP INDEX IF EXISTS public.idx_notifications_task_deleted_batch;
SELECT jsonb_build_object(
  'indice_removido', to_regclass('public.idx_notifications_task_deleted_batch') IS NULL
)::text AS resultado;
