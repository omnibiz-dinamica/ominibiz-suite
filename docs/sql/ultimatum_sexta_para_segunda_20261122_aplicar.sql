-- =====================================================================
-- OmniBiz · 22/11/2026 — Ultimatum Architekten - CM (Jessica Avani Simao)
-- A partir de 07/12/2026 passa de SEXTA para SEGUNDA, mesmo horário.
--   • Série atual (sextas) fica até sexta 04/12/2026 (fim 06/12).
--   • Nova série às segundas, início 07/12/2026, mesmos dados e horário.
--   • As 50 tarefas já criadas de sexta 11/12 em diante passam para a segunda
--     anterior (−4 dias) e para a nova série: mesmas tarefas, nada apagado.
-- Desfazer: ultimatum_sexta_para_segunda_20261122_desfazer.sql
-- =====================================================================
BEGIN;

DO $guard$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.task_recurrences WHERE id = '31ec417f-3b42-4d1d-93fb-4ce8ff4429e4';
  IF r.id IS NULL OR r.weekdays <> ARRAY[5] OR r.end_date IS NOT NULL OR r.status <> 'active' THEN
    RAISE EXCEPTION 'PARAR: a série não está como esperado (dias %, fim %, estado %). Nada foi alterado.', r.weekdays, r.end_date, r.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE recurrence_id = r.id AND recurrence_date >= DATE '2026-12-11'
             AND (status NOT IN ('pendente','autorizado') OR EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = tasks.id))) THEN
    RAISE EXCEPTION 'PARAR: há tarefas de 11/12 em diante já iniciadas ou com ponto. Nada foi alterado.';
  END IF;
END
$guard$;

CREATE TEMP TABLE _nova_serie ON COMMIT DROP AS SELECT gen_random_uuid() AS id;

-- 1) Nova série às segundas (cópia da atual).
INSERT INTO public.task_recurrences
SELECT (jsonb_populate_record(NULL::public.task_recurrences,
  to_jsonb(r) || jsonb_build_object(
    'id', (SELECT id FROM _nova_serie), 'weekdays', jsonb_build_array(1),
    'start_date', '2026-12-07', 'end_date', NULL, 'status', 'active',
    'ended_at', NULL, 'ended_reason', NULL, 'created_at', now(), 'updated_at', now()))).*
FROM public.task_recurrences r WHERE r.id = '31ec417f-3b42-4d1d-93fb-4ce8ff4429e4';

-- 2) Série das sextas termina depois de sexta 04/12.
UPDATE public.task_recurrences SET end_date = DATE '2026-12-06'
 WHERE id = '31ec417f-3b42-4d1d-93fb-4ce8ff4429e4';

-- 3) Tarefas de sexta 11/12 em diante → segunda anterior, na nova série.
UPDATE public.tasks t SET
  recurrence_id   = (SELECT id FROM _nova_serie),
  recurrence_date = t.recurrence_date - 4,
  scheduled_for   = t.scheduled_for - interval '4 days',
  scheduled_end   = t.scheduled_end - interval '4 days',
  due_at          = t.due_at - interval '4 days',
  updated_at      = now()
WHERE t.recurrence_id = '31ec417f-3b42-4d1d-93fb-4ce8ff4429e4'
  AND t.recurrence_date >= DATE '2026-12-11';

SELECT public._activity_emit(
  '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'::uuid, '82ae91cb-315c-4641-8eaa-9b75b6f153f5'::uuid,
  'recurrence', (SELECT id FROM _nova_serie), 'series_edited', 'gestao',
  'Mudou "Ultimatum Architekten - CM" (Jessica Avani Simao) de sexta para segunda a partir de 07/12/2026',
  jsonb_build_object('Dia da semana', jsonb_build_object('de', 'sexta', 'para', 'segunda'),
                     'A partir de', '2026-12-07', 'Horário', 'igual (20:30–23:30)'),
  'user');

COMMIT;

SELECT jsonb_build_object(
  'serie_sexta_fim', (SELECT end_date FROM public.task_recurrences WHERE id = '31ec417f-3b42-4d1d-93fb-4ce8ff4429e4'),
  'nova_serie', (SELECT jsonb_build_object('id', id, 'dias', weekdays, 'inicio', start_date)
                 FROM public.task_recurrences WHERE title = 'Ultimatum Architekten - CM'
                   AND assigned_to = 'af4e216b-a81c-4e99-bb43-29c34e024059' AND start_date = DATE '2026-12-07'),
  'proximas', (SELECT jsonb_agg(to_char(scheduled_for AT TIME ZONE 'Europe/Brussels', 'Dy DD/MM HH24:MI') ORDER BY scheduled_for)
               FROM (SELECT scheduled_for FROM public.tasks
                     WHERE assigned_to = 'af4e216b-a81c-4e99-bb43-29c34e024059' AND title = 'Ultimatum Architekten - CM'
                       AND deleted_at IS NULL AND recurrence_date BETWEEN DATE '2026-12-01' AND DATE '2026-12-31') x)
)::text AS resultado;
