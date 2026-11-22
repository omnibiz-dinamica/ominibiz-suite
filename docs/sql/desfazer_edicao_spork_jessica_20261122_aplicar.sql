-- =====================================================================
-- OmniBiz · 22/11/2026 — Desfaz a edição de 19:15 da recorrência
-- "Trabalho novo perto do Spork cafe - CM" (Jessica Avani Simao).
--   • Datas da série voltam ao que estavam: início 14/11/2026, fim 27/11/2026
--     (a série continua encerrada, como estava às 19:14).
--   • Volta a tarefa de segunda 23/11/2026 08:00–10:00 (era a única das 71
--     que estava ativa; as outras 70 já estavam excluídas desde as 13:52).
--   • Fica registado no Histórico.
-- Desfazer: desfazer_edicao_spork_jessica_20261122_desfazer.sql
-- =====================================================================
BEGIN;

DO $guard$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.task_recurrences WHERE id = 'dda42b62-7af1-4f36-b6b0-a769ae06020d';
  IF r.id IS NULL OR r.start_date <> DATE '2026-11-30' OR r.end_date <> DATE '2027-03-28' THEN
    RAISE EXCEPTION 'PARAR: a série não está como ficou às 19:15 (início %, fim %). Nada foi alterado.', r.start_date, r.end_date;
  END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE recurrence_id = r.id AND recurrence_date = DATE '2026-11-23') THEN
    RAISE EXCEPTION 'PARAR: a tarefa de 23/11 já existe. Nada foi alterado.';
  END IF;
END
$guard$;

UPDATE public.task_recurrences
   SET start_date = DATE '2026-11-14', end_date = DATE '2026-11-27'
 WHERE id = 'dda42b62-7af1-4f36-b6b0-a769ae06020d';

INSERT INTO public.tasks (company_id, title, status, priority, assigned_to, created_by,
  scheduled_for, scheduled_end, due_at, client_id, recurrence_id, recurrence_date,
  task_group_id, absence_grace_minutes)
SELECT company_id, title, 'pendente', priority, assigned_to, created_by,
  TIMESTAMPTZ '2026-11-23 07:00:00+00', TIMESTAMPTZ '2026-11-23 09:00:00+00', TIMESTAMPTZ '2026-11-23 09:00:00+00',
  client_id, recurrence_id, DATE '2026-11-23', task_group_id, absence_grace_minutes
FROM public.tasks
WHERE recurrence_id = 'dda42b62-7af1-4f36-b6b0-a769ae06020d' AND recurrence_date = DATE '2026-11-21';

SELECT public._activity_emit(
  '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'::uuid, '82ae91cb-315c-4641-8eaa-9b75b6f153f5'::uuid,
  'recurrence', 'dda42b62-7af1-4f36-b6b0-a769ae06020d'::uuid, 'series_edited', 'gestao',
  'Desfez a edição de 19:15 da recorrência "Trabalho novo perto do Spork cafe - CM" (Jessica Avani Simao)',
  jsonb_build_object(
    'Data início', jsonb_build_object('de', '2026-11-30', 'para', '2026-11-14'),
    'Data fim', jsonb_build_object('de', '2027-03-28', 'para', '2026-11-27'),
    'Tarefa reposta', '23/11/2026 08:00–10:00'),
  'user');

COMMIT;

SELECT jsonb_build_object(
  'inicio', r.start_date, 'fim', r.end_date, 'estado', r.status,
  'tarefa_23_11', (SELECT status FROM public.tasks t WHERE t.recurrence_id = r.id AND t.recurrence_date = DATE '2026-11-23' AND t.deleted_at IS NULL)
)::text AS resultado
FROM public.task_recurrences r WHERE r.id = 'dda42b62-7af1-4f36-b6b0-a769ae06020d';
