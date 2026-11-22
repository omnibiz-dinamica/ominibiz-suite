-- =====================================================================
-- OmniBiz · 22/11/2026 — "Excluir esta e futuras" dava
-- "canceling statement due to statement timeout" (limite de 8 s).
-- Desfazer: indice_excluir_serie_20261122_desfazer.sql
--
-- Causa: por cada ocorrência excluída, o trigger _task_deleted_notify procura
-- e atualiza o aviso agrupado ("N ocorrências excluídas") por
-- metadata->>'batch_key', sem índice: percorre as ~359 mil notificações
-- (~48 ms) — 52 ocorrências × 1–2 pessoas = 5–10 s.
-- Correção: só um índice parcial (apenas as notificações 'task_deleted').
-- Não altera funções nem dados. Cria-se em ~1–2 s (bloqueia escrita em
-- notifications durante esse tempo).
-- =====================================================================
DO $guard$
BEGIN
  IF to_regclass('public.idx_notifications_task_deleted_batch') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
END
$guard$;

CREATE INDEX idx_notifications_task_deleted_batch
  ON public.notifications ((metadata->>'batch_key'))
  WHERE event = 'task_deleted';

ANALYZE public.notifications;

SELECT jsonb_build_object(
  'indice_criado', to_regclass('public.idx_notifications_task_deleted_batch') IS NOT NULL
)::text AS resultado;
