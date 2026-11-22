-- Reverte ultimatum_sexta_para_segunda_20261122_aplicar.sql (volta tudo às sextas).
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.task_recurrences WHERE title = 'Ultimatum Architekten - CM'
        AND assigned_to = 'af4e216b-a81c-4e99-bb43-29c34e024059' AND start_date = DATE '2026-12-07' AND weekdays = ARRAY[1]) <> 1 THEN
    RAISE EXCEPTION 'PARAR: a série das segundas não foi encontrada. Nada foi alterado.';
  END IF;
END
$guard$;
CREATE TEMP TABLE _nova ON COMMIT DROP AS
  SELECT id FROM public.task_recurrences WHERE title = 'Ultimatum Architekten - CM'
    AND assigned_to = 'af4e216b-a81c-4e99-bb43-29c34e024059' AND start_date = DATE '2026-12-07' AND weekdays = ARRAY[1];
DO $g2$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tasks WHERE recurrence_id = (SELECT id FROM _nova)
             AND (status NOT IN ('pendente','autorizado') OR EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = tasks.id))) THEN
    RAISE EXCEPTION 'PARAR: há tarefas de segunda já iniciadas. Nada foi alterado.';
  END IF;
END
$g2$;
-- Tarefas criadas depois pela série nova (além das movidas) são removidas; as movidas voltam à sexta.
DELETE FROM public.tasks WHERE recurrence_id = (SELECT id FROM _nova) AND recurrence_date > DATE '2027-11-15';
UPDATE public.tasks t SET recurrence_id = '31ec417f-3b42-4d1d-93fb-4ce8ff4429e4', recurrence_date = t.recurrence_date + 4,
  scheduled_for = t.scheduled_for + interval '4 days', scheduled_end = t.scheduled_end + interval '4 days',
  due_at = t.due_at + interval '4 days', updated_at = now()
WHERE t.recurrence_id = (SELECT id FROM _nova);
UPDATE public.task_recurrences SET end_date = NULL WHERE id = '31ec417f-3b42-4d1d-93fb-4ce8ff4429e4';
DELETE FROM public.task_recurrences WHERE id = (SELECT id FROM _nova);
COMMIT;
