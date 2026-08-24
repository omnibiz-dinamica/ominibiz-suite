ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE TABLE IF NOT EXISTS public.task_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL,
  event text NOT NULL CHECK (event IN ('cancel','archive','unarchive')),
  previous_status public.task_status,
  new_status public.task_status,
  previous_archived boolean,
  new_archived boolean,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_audit_events_task_idx ON public.task_audit_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_audit_events_company_idx ON public.task_audit_events(company_id, created_at DESC);

GRANT SELECT ON public.task_audit_events TO authenticated;
GRANT ALL ON public.task_audit_events TO service_role;

ALTER TABLE public.task_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_audit_events_read" ON public.task_audit_events;
CREATE POLICY "task_audit_events_read"
ON public.task_audit_events FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_company_manager(auth.uid(), company_id)
  OR EXISTS (
    SELECT 1 FROM public.tasks t
     WHERE t.id = task_audit_events.task_id
       AND t.assigned_to = auth.uid()
  )
);

-- Bypass controlado: as RPCs SECURITY DEFINER abaixo validam permissões
-- explicitamente antes de tocar em public.tasks.
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
  IF current_setting('omnibiz.task_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF public.is_super_admin(_uid) OR public.is_company_manager(_uid, NEW.company_id) THEN
    RETURN NEW;
  END IF;

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

-- Cancelamento auditado (gestor ou responsável), motivo obrigatório.
CREATE OR REPLACE FUNCTION public.task_cancel(_task_id uuid, _reason text)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_is_manager boolean;
  v_is_sa boolean;
  v_is_assignee boolean;
  v_open uuid;
  v_prev public.task_status;
  v_reason text := NULLIF(btrim(COALESCE(_reason,'')), '');
  v_role text;
  v_actor text;
  v_mgr record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo do cancelamento obrigatorio'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;
  IF v_task.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Tarefa excluida'; END IF;

  v_is_sa := public.is_super_admin(v_uid);
  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := (v_task.assigned_to = v_uid);

  IF NOT (v_is_sa OR v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissao para cancelar esta tarefa';
  END IF;

  IF v_task.status = 'cancelado' THEN
    RETURN v_task;
  END IF;
  IF v_task.status IN ('concluido','ausente') AND NOT (v_is_manager OR v_is_sa) THEN
    RAISE EXCEPTION 'Apenas gestor pode cancelar tarefa neste estado';
  END IF;
  IF v_task.status = 'concluido' THEN
    RAISE EXCEPTION 'Tarefa concluida nao pode ser cancelada';
  END IF;

  SELECT id INTO v_open FROM public.time_entries
   WHERE task_id = v_task.id AND ended_at IS NULL AND voided_at IS NULL
   LIMIT 1;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'TASK_HAS_OPEN_PUNCH: Existe um ponto aberto nesta tarefa. Encerre ou regularize o ponto antes de continuar.';
  END IF;

  v_prev := v_task.status;
  v_role := CASE WHEN v_is_sa THEN 'super_admin' WHEN v_is_manager THEN 'manager' ELSE 'employee' END;

  PERFORM set_config('omnibiz.task_rpc', 'on', true);

  UPDATE public.tasks
     SET status = 'cancelado',
         cancelled_at = now(),
         cancelled_by = v_uid,
         cancellation_reason = v_reason,
         updated_at = now()
   WHERE id = _task_id
   RETURNING * INTO v_task;

  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, previous_archived, new_archived, reason
  ) VALUES (
    v_task.company_id, v_task.id, v_uid, v_role, 'cancel',
    v_prev, 'cancelado', v_task.archived_at IS NOT NULL, v_task.archived_at IS NOT NULL, v_reason
  );

  IF v_role = 'employee' THEN
    SELECT full_name INTO v_actor FROM public.profiles WHERE id = v_uid;
    FOR v_mgr IN
      SELECT DISTINCT user_id FROM public.user_roles
       WHERE company_id = v_task.company_id
         AND role IN ('manager','owner')
         AND user_id <> v_uid
    LOOP
      PERFORM public._notify(
        v_task.company_id, v_mgr.user_id, v_task.id,
        'task_cancelled', 'Tarefa cancelada pelo funcionario',
        COALESCE(v_actor,'O funcionario') || ' cancelou a tarefa ' || v_task.title
          || '. Motivo: ' || v_reason,
        'alta',
        jsonb_build_object(
          'cancelled_by', v_uid,
          'cancellation_reason', v_reason,
          'task_id', v_task.id,
          'link', '/app/tarefas?task=' || v_task.id::text
        )
      );
    END LOOP;
  END IF;

  RETURN v_task;
END
$function$;

-- Arquivamento manual: gestor, super admin ou o próprio responsável.
CREATE OR REPLACE FUNCTION public.task_archive(_task_id uuid, _archive boolean DEFAULT true)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_is_manager boolean;
  v_is_sa boolean;
  v_is_assignee boolean;
  v_open uuid;
  v_role text;
  v_prev boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa nao encontrada';
  END IF;
  IF v_task.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tarefa excluida nao pode ser arquivada';
  END IF;

  v_is_sa := public.is_super_admin(v_uid);
  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := (v_task.assigned_to = v_uid);

  IF NOT (v_is_sa OR v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissao para arquivar esta tarefa';
  END IF;

  v_role := CASE WHEN v_is_sa THEN 'super_admin' WHEN v_is_manager THEN 'manager' ELSE 'employee' END;
  v_prev := v_task.archived_at IS NOT NULL;

  IF _archive THEN
    IF v_prev THEN
      RETURN v_task;
    END IF;
    IF v_task.status NOT IN ('concluido','cancelado','ausente') THEN
      RAISE EXCEPTION 'Apenas tarefas concluidas, canceladas ou ausentes podem ser arquivadas';
    END IF;

    SELECT id INTO v_open FROM public.time_entries
     WHERE task_id = v_task.id AND ended_at IS NULL AND voided_at IS NULL
     LIMIT 1;
    IF v_open IS NOT NULL THEN
      RAISE EXCEPTION 'TASK_HAS_OPEN_PUNCH: Existe um ponto aberto nesta tarefa. Encerre ou regularize o ponto antes de continuar.';
    END IF;

    PERFORM set_config('omnibiz.task_rpc', 'on', true);
    UPDATE public.tasks
       SET archived_at = now(),
           archived_by = v_uid,
           updated_at  = now()
     WHERE id = _task_id
     RETURNING * INTO v_task;
    PERFORM set_config('omnibiz.task_rpc', 'off', true);
  ELSE
    IF NOT v_prev THEN
      RETURN v_task;
    END IF;
    IF NOT (v_is_sa OR v_is_manager) THEN
      RAISE EXCEPTION 'Apenas gestor ou super admin pode desarquivar tarefas';
    END IF;

    PERFORM set_config('omnibiz.task_rpc', 'on', true);
    UPDATE public.tasks
       SET archived_at = NULL,
           archived_by = NULL,
           updated_at  = now()
     WHERE id = _task_id
     RETURNING * INTO v_task;
    PERFORM set_config('omnibiz.task_rpc', 'off', true);
  END IF;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, previous_archived, new_archived, reason
  ) VALUES (
    v_task.company_id, v_task.id, v_uid, v_role,
    CASE WHEN _archive THEN 'archive' ELSE 'unarchive' END,
    v_task.status, v_task.status, v_prev, v_task.archived_at IS NOT NULL, NULL
  );

  RETURN v_task;
END
$function$;

GRANT EXECUTE ON FUNCTION public.task_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_archive(uuid, boolean) TO authenticated;