-- OmniBiz · DESFAZER gestor_notificacoes_20261118_aplicar.sql (SUP-160)
-- Apaga a função. As notificações já enviadas ficam (são histórico).
BEGIN;
DROP FUNCTION IF EXISTS public.manager_send_notification(uuid, uuid[], text, text, text, text);
COMMIT;
SELECT jsonb_build_object('funcao_apagada',
  to_regprocedure('public.manager_send_notification(uuid,uuid[],text,text,text,text)') IS NULL)::text AS resultado;
