-- SUP-2026-000093
-- Pendente -> atrasada -> ausente usa o mesmo instante em todas as telas.
-- A ausencia automatica nasce somente 24h apos scheduled_for.

CREATE OR REPLACE FUNCTION public.task_absence_allowed_at(
  _scheduled_for timestamptz,
  _recurrence_date date,
  _due_at timestamptz
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _scheduled_for IS NULL THEN NULL
    ELSE _scheduled_for + interval '24 hours'
  END
$$;

-- Corrige somente ausencias automaticas comprovadamente antecipadas. Falta
-- manual/funcionario e ausencias validas nao sao tocadas.
UPDATE public.tasks
   SET status = 'pendente',
       marked_absent_at = NULL,
       absence_source = NULL,
       updated_at = now()
 WHERE status = 'ausente'
   AND absence_source = 'automatica'
   AND scheduled_for IS NOT NULL
   AND marked_absent_at IS NOT NULL
   AND marked_absent_at >= scheduled_for
   AND now() < scheduled_for + interval '24 hours';

CREATE OR REPLACE FUNCTION public.tasks_sweep_absent(_company_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  WITH upd AS (
    UPDATE public.tasks t
       SET status = 'ausente', marked_absent_at = now(), updated_at = now(),
           absence_source = 'automatica'
     WHERE t.status IN ('pendente','autorizado')
       AND t.archived_at IS NULL
       AND t.deleted_at IS NULL
       AND t.assigned_to IS NOT NULL
       AND t.scheduled_for IS NOT NULL
       AND t.scheduled_end IS NOT NULL
       AND NOT public.task_timing_is_manual(t.client_id)
       AND now() >= public.task_absence_allowed_at(t.scheduled_for, t.recurrence_date, t.due_at)
       AND NOT EXISTS (
         SELECT 1 FROM public.time_entries te
          WHERE te.task_id = t.id AND te.voided_at IS NULL
       )
       AND (
         public.is_super_admin(v_uid)
         OR (_company_id IS NOT NULL AND t.company_id = _company_id AND public.is_company_manager(v_uid, t.company_id))
         OR (_company_id IS NULL AND public.is_company_manager(v_uid, t.company_id))
       )
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN COALESCE(v_count, 0);
END
$function$;

GRANT EXECUTE ON FUNCTION public.task_absence_allowed_at(timestamptz, date, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tasks_sweep_absent(uuid) TO authenticated, service_role;

-- O funcionário pode abrir a tela sem disparar o sweep administrativo. Nesse
-- caso, após o mesmo prazo canônico, o pedido de nova autorização continua
-- válido sem permitir um início fora do fluxo de ausência.
CREATE OR REPLACE FUNCTION public.task_request_authorization(_task_id uuid, _note text DEFAULT NULL)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_manager boolean;
  v_is_assignee boolean;
  v_mgr record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := v_task.assigned_to = v_uid;
  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissão para solicitar autorização';
  END IF;

  IF v_task.status NOT IN ('ausente', 'cancelado')
     AND NOT (
       v_task.status = 'pendente'
       AND v_task.scheduled_for IS NOT NULL
       AND now() >= public.task_absence_allowed_at(v_task.scheduled_for, v_task.recurrence_date, v_task.due_at)
     ) THEN
    RAISE EXCEPTION 'Só é possível solicitar autorização de tarefa ausente ou rejeitada';
  END IF;

  UPDATE public.tasks
     SET status = 'pendente',
         marked_absent_at = NULL,
         cancelled_at = NULL,
         cancelled_by = NULL,
         late_notified_at = NULL,
         notes = COALESCE(notes, '') ||
                 CASE WHEN _note IS NOT NULL
                      THEN E'\n[reautorização solicitada] ' || _note
                      ELSE E'\n[reautorização solicitada]' END,
         updated_at = now()
   WHERE id = _task_id
   RETURNING * INTO v_task;

  FOR v_mgr IN
    SELECT DISTINCT user_id FROM public.user_roles
     WHERE company_id = v_task.company_id AND role IN ('manager', 'super_admin')
  LOOP
    PERFORM public._notify(
      v_task.company_id, v_mgr.user_id, v_task.id,
      'task_authorization_requested', 'Solicitação de autorização',
      v_task.title, 'alta', jsonb_build_object('requested_by', v_uid));
  END LOOP;

  RETURN v_task;
END
$$;

REVOKE ALL ON FUNCTION public.task_request_authorization(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_request_authorization(uuid, text) TO authenticated;
