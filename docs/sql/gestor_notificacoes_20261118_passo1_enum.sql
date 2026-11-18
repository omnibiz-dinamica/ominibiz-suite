-- OmniBiz · 18/11/2026 — PASSO 1 de gestor_notificacoes_20261118_aplicar.sql (SUP-160)
-- Acrescenta o tipo de notificação "Mensagem da gestão". Não altera dados.
-- (Sem desfazer: o Postgres não remove valores de enum; sem uso, não afeta nada.)
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'manager_message';
SELECT 'passo 1 ok' AS resultado;
