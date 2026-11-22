-- Reverte desfazer_edicao_spork_jessica_20261122_aplicar.sql (volta ao estado das 19:15).
BEGIN;
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.task_recurrences WHERE id = 'dda42b62-7af1-4f36-b6b0-a769ae06020d'
                 AND start_date = DATE '2026-11-14' AND end_date = DATE '2026-11-27') THEN
    RAISE EXCEPTION 'PARAR: o script de aplicar não está aplicado. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE recurrence_id = 'dda42b62-7af1-4f36-b6b0-a769ae06020d'
             AND recurrence_date = DATE '2026-11-23' AND status <> 'pendente') THEN
    RAISE EXCEPTION 'PARAR: a tarefa de 23/11 já foi iniciada/alterada. Nada foi alterado.';
  END IF;
END
$guard$;
DELETE FROM public.tasks WHERE recurrence_id = 'dda42b62-7af1-4f36-b6b0-a769ae06020d' AND recurrence_date = DATE '2026-11-23';
UPDATE public.task_recurrences SET start_date = DATE '2026-11-30', end_date = DATE '2027-03-28'
 WHERE id = 'dda42b62-7af1-4f36-b6b0-a769ae06020d';
COMMIT;
