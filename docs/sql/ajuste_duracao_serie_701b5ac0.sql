-- Ajuste de duração inflada — série 701b5ac0 (Cleudilene Magno / Defense Peutie - Vilvoorde)
-- Autorizado por Eduardo em 08/10/2026. Sem BEGIN/COMMIT (roda dentro da transação do executor).
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $$
DECLARE
  c_serie_id       constant uuid := '701b5ac0-c01d-4ade-8f82-66e6c913c994';
  c_company_id     constant uuid := '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c';
  c_expected_tasks constant int  := 17;
  v_rows int;
BEGIN
  UPDATE public.task_recurrences
     SET duration_minutes = 240, updated_at = NOW()
   WHERE id = c_serie_id AND company_id = c_company_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Trava: série afetou % linha(s), esperado 1', v_rows;
  END IF;

  UPDATE public.tasks
     SET scheduled_end = scheduled_for + INTERVAL '240 minutes',
         due_at        = scheduled_for + INTERVAL '240 minutes',
         updated_at    = NOW()
   WHERE recurrence_id = c_serie_id
     AND company_id = c_company_id
     AND status IN ('pendente','autorizado','em_andamento')
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> c_expected_tasks THEN
    RAISE EXCEPTION 'Trava: tarefas afetadas %, esperado %', v_rows, c_expected_tasks;
  END IF;
END $$;
