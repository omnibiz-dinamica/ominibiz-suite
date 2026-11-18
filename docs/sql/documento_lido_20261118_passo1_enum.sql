-- OmniBiz · 18/11/2026 — PASSO 1 de documento_lido_20261118_aplicar.sql
-- Acrescenta o tipo de notificação "Documento lido". Não altera dados.
-- (Não tem desfazer: o Postgres não remove valores de enum; sem uso, não afeta nada.)
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'employee_document_viewed';
SELECT 'passo 1 ok' AS resultado;
