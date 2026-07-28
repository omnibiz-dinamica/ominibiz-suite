CREATE OR REPLACE FUNCTION public.tasks_restrict_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  -- Sem sessão (jobs internos / service_role) ou gestores: sem restrição de colunas.
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_super_admin(_uid) OR public.is_company_manager(_uid, NEW.company_id) THEN
    RETURN NEW;
  END IF;

  -- Funcionário atribuído: apenas colunas de andamento podem mudar.
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.location IS DISTINCT FROM OLD.location
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.due_at IS DISTINCT FROM OLD.due_at
     OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
     OR NEW.scheduled_end IS DISTINCT FROM OLD.scheduled_end
     OR NEW.absence_grace_minutes IS DISTINCT FROM OLD.absence_grace_minutes
     OR NEW.punch_mode_override IS DISTINCT FROM OLD.punch_mode_override
     OR NEW.recurrence_id IS DISTINCT FROM OLD.recurrence_id
     OR NEW.recurrence_date IS DISTINCT FROM OLD.recurrence_date
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
     OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by
     OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
  THEN
    RAISE EXCEPTION 'Sem permissao para alterar estes campos da tarefa';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_restrict_employee_update ON public.tasks;
CREATE TRIGGER trg_tasks_restrict_employee_update
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tasks_restrict_employee_update();