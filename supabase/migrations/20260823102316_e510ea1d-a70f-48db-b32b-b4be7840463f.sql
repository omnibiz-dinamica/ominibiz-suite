CREATE OR REPLACE FUNCTION public.tasks_require_assignee_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas criações feitas por um utilizador autenticado e fora de recorrência.
  -- Jobs internos (auth.uid() nulo) e materialização de recorrências continuam intactos.
  IF auth.uid() IS NOT NULL
     AND NEW.recurrence_id IS NULL
     AND NEW.assigned_to IS NULL THEN
    RAISE EXCEPTION 'Atribua a tarefa a um funcionário antes de salvar.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_require_assignee ON public.tasks;
CREATE TRIGGER trg_tasks_require_assignee
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_require_assignee_on_insert();