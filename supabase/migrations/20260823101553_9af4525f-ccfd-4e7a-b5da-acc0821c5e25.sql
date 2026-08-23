CREATE OR REPLACE FUNCTION public.tasks_restrict_employee_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _self_refusal boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_super_admin(_uid) OR public.is_company_manager(_uid, NEW.company_id) THEN
    RETURN NEW;
  END IF;

  -- Recusa da própria tarefa pelo responsável: a RPC task_transition grava
  -- cancelled_by/refused_by com o próprio uid. Isso é legítimo.
  _self_refusal := (
    OLD.assigned_to = _uid
    AND NEW.assigned_to = _uid
    AND NEW.status = 'cancelado'
    AND OLD.status IN ('pendente','autorizado')
    AND OLD.cancelled_by IS NULL
    AND NEW.cancelled_by = _uid
    AND NEW.refused_by = _uid
    AND NEW.refusal_reason IS NOT NULL
  );

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
     OR (NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by AND NOT _self_refusal)
  THEN
    RAISE EXCEPTION 'Sem permissao para alterar estes campos da tarefa';
  END IF;

  RETURN NEW;
END;
$function$;