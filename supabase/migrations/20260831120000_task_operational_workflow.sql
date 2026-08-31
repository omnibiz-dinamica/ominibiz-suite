-- OmniBiz: regras operacionais de atraso/ausência e feed de Ponto Gestão.
-- Aditivo: não cria pontos fictícios, não altera dados históricos e preserva RLS/RBAC.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS no_start_reason text,
  ADD COLUMN IF NOT EXISTS no_start_reason_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_start_reason_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.task_audit_events DROP CONSTRAINT IF EXISTS task_audit_events_event_check;
ALTER TABLE public.task_audit_events
  ADD CONSTRAINT task_audit_events_event_check
  CHECK (event IN ('cancel','archive','unarchive','absence','delete','series_end','completion_note','no_start_reason'));

-- Ausência automática: somente início previsto + 24 horas. Tarefas sem horário
-- permanecem operacionais, sem conversão automática para ausente.
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
  SELECT CASE WHEN _scheduled_for IS NULL THEN NULL ELSE _scheduled_for + interval '24 hours' END
$$;

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
       -- Qualquer ponto válido prova que houve START, inclusive um ponto já encerrado.
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

CREATE OR REPLACE FUNCTION public.task_record_no_start_reason(_task_id uuid, _reason text)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_is_manager boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo de nao ter iniciado a tarefa obrigatorio'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;
  v_is_manager := public.is_company_manager(v_uid, v_task.company_id) OR public.is_super_admin(v_uid);
  IF NOT v_is_manager AND v_task.assigned_to IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Sem permissao para registrar justificativa nesta tarefa';
  END IF;
  IF v_task.status NOT IN ('pendente','autorizado') THEN
    RAISE EXCEPTION 'Somente tarefa pendente ou autorizada pode receber justificativa de nao inicio';
  END IF;

  UPDATE public.tasks
     SET no_start_reason = v_reason,
         no_start_reason_at = now(),
         no_start_reason_by = v_uid,
         updated_at = now()
   WHERE id = v_task.id
   RETURNING * INTO v_task;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event, previous_status, new_status,
    reason, recurrence_id, occurrence_date, action_scope
  ) VALUES (
    v_task.company_id, v_task.id, v_uid,
    CASE WHEN v_is_manager THEN 'manager' ELSE 'employee' END,
    'no_start_reason', v_task.status, v_task.status, v_reason,
    v_task.recurrence_id,
    COALESCE(v_task.recurrence_date, v_task.scheduled_for::date, v_task.due_at::date),
    'single'
  );
  RETURN v_task;
END
$function$;

REVOKE ALL ON FUNCTION public.task_record_no_start_reason(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_record_no_start_reason(uuid, text) TO authenticated;

-- Feed canônico de Ponto Gestão: pontos, faltas e tarefas operacionais ainda sem ponto.
CREATE OR REPLACE FUNCTION public.timesheet_operational_list(
  _company_id uuid,
  _employee_id uuid DEFAULT NULL,
  _client_id uuid DEFAULT NULL,
  _task_search text DEFAULT NULL,
  _status text DEFAULT 'all',
  _from_ts timestamptz DEFAULT NULL,
  _to_ts timestamptz DEFAULT NULL,
  _from_date date DEFAULT NULL,
  _to_date date DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.is_company_manager(v_uid, _company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _status NOT IN ('all', 'open', 'closed') THEN RAISE EXCEPTION 'INVALID_STATUS_FILTER'; END IF;
  IF _limit < 1 OR _limit > 5000 OR _offset < 0 THEN RAISE EXCEPTION 'INVALID_PAGINATION'; END IF;

  RETURN (
    WITH work_rows AS (
      SELECT te.id, te.company_id, te.task_id, te.user_id, te.started_at, te.ended_at,
        te.paused_at, te.resumed_at, te.effective_minutes, te.notes, te.created_at, te.updated_at,
        te.origin::text AS origin, te.created_by, te.last_edited_by, te.last_edited_at, te.last_edit_reason,
        te.voided_at, te.voided_by, te.void_reason, te.entry_kind::text AS entry_kind,
        te.paid_leave_minutes, t.title AS task_title, t.client_id, t.scheduled_for, t.scheduled_end,
        t.recurrence_date, t.due_at, p.full_name AS employee_name,
        CASE WHEN te.entry_kind::text = 'paid_leave' THEN 'paid_leave' ELSE 'work' END AS record_kind,
        NULL::text AS absence_reason, NULL::boolean AS absence_justified, NULL::text AS absence_source,
        t.status::text AS task_status,
        CASE WHEN t.status = 'em_andamento' AND te.ended_at IS NULL THEN 'em_andamento' ELSE 'trabalhado' END AS operational_status,
        t.no_start_reason, t.no_start_reason_at, t.no_start_reason_by,
        te.started_at AS sort_at
      FROM public.time_entries te
      LEFT JOIN public.tasks t ON t.id = te.task_id
      JOIN public.profiles p ON p.id = te.user_id
      WHERE te.company_id = _company_id AND te.voided_at IS NULL
        AND (_employee_id IS NULL OR te.user_id = _employee_id)
        AND (_status = 'all' OR (_status = 'open' AND te.ended_at IS NULL) OR (_status = 'closed' AND te.ended_at IS NOT NULL))
       AND (_from_ts IS NULL OR te.started_at >= _from_ts) AND (_to_ts IS NULL OR te.started_at <= _to_ts)
         AND (t.id IS NULL OR (t.archived_at IS NULL AND t.deleted_at IS NULL))
         AND (_client_id IS NULL OR t.client_id = _client_id)
        AND (NULLIF(btrim(COALESCE(_task_search, '')), '') IS NULL OR COALESCE(t.title, '') ILIKE '%' || btrim(_task_search) || '%')
    ), absence_rows AS (
      SELECT t.id, t.company_id, t.id AS task_id, t.assigned_to AS user_id, NULL::timestamptz AS started_at,
        NULL::timestamptz AS ended_at, NULL::timestamptz AS paused_at, NULL::timestamptz AS resumed_at,
        NULL::integer AS effective_minutes, t.absence_reason AS notes,
        COALESCE(t.marked_absent_at, t.updated_at, t.created_at) AS created_at, t.updated_at,
        'manager_manual'::text AS origin, t.marked_absent_by AS created_by, NULL::uuid AS last_edited_by,
        NULL::timestamptz AS last_edited_at, NULL::text AS last_edit_reason, NULL::timestamptz AS voided_at,
        NULL::uuid AS voided_by, NULL::text AS void_reason, NULL::text AS entry_kind,
        NULL::integer AS paid_leave_minutes, t.title AS task_title, t.client_id, t.scheduled_for, t.scheduled_end,
        t.recurrence_date, t.due_at, p.full_name AS employee_name, 'absence'::text AS record_kind,
        t.absence_reason, t.absence_justified, t.absence_source, t.status::text AS task_status,
        'absence'::text AS operational_status, t.no_start_reason, t.no_start_reason_at, t.no_start_reason_by,
        COALESCE(t.scheduled_for, t.recurrence_date::timestamptz, t.due_at, t.updated_at) AS sort_at
      FROM public.tasks t JOIN public.profiles p ON p.id = t.assigned_to
      WHERE t.company_id = _company_id AND t.assigned_to IS NOT NULL AND t.status = 'ausente'
        AND t.archived_at IS NULL AND t.deleted_at IS NULL AND _status = 'all'
        AND (_employee_id IS NULL OR t.assigned_to = _employee_id)
        AND (_from_date IS NULL OR COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) >= _from_date)
        AND (_to_date IS NULL OR COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) <= _to_date)
        AND (_client_id IS NULL OR t.client_id = _client_id)
        AND (NULLIF(btrim(COALESCE(_task_search, '')), '') IS NULL OR t.title ILIKE '%' || btrim(_task_search) || '%')
    ), task_rows AS (
      SELECT t.id, t.company_id, t.id AS task_id, t.assigned_to AS user_id, NULL::timestamptz AS started_at,
        NULL::timestamptz AS ended_at, NULL::timestamptz AS paused_at, NULL::timestamptz AS resumed_at,
        NULL::integer AS effective_minutes, t.no_start_reason AS notes, t.created_at, t.updated_at,
        'employee_punch'::text AS origin, NULL::uuid AS created_by, NULL::uuid AS last_edited_by,
        NULL::timestamptz AS last_edited_at, NULL::text AS last_edit_reason, NULL::timestamptz AS voided_at,
        NULL::uuid AS voided_by, NULL::text AS void_reason, NULL::text AS entry_kind,
        NULL::integer AS paid_leave_minutes, t.title AS task_title, t.client_id, t.scheduled_for, t.scheduled_end,
        t.recurrence_date, t.due_at, p.full_name AS employee_name, 'task'::text AS record_kind,
        NULL::text AS absence_reason, NULL::boolean AS absence_justified, NULL::text AS absence_source,
        t.status::text AS task_status,
        CASE WHEN t.status = 'em_andamento' THEN 'em_andamento'
             WHEN t.scheduled_for IS NOT NULL AND t.scheduled_for <= now() THEN 'atrasada'
             ELSE 'pendente' END AS operational_status,
        t.no_start_reason, t.no_start_reason_at, t.no_start_reason_by,
        COALESCE(t.scheduled_for, t.recurrence_date::timestamptz, t.due_at, t.updated_at) AS sort_at
      FROM public.tasks t JOIN public.profiles p ON p.id = t.assigned_to
      WHERE t.company_id = _company_id AND t.assigned_to IS NOT NULL
        AND t.status IN ('pendente','autorizado','em_andamento')
        AND t.archived_at IS NULL AND t.deleted_at IS NULL AND _status IN ('all','open')
        AND (_employee_id IS NULL OR t.assigned_to = _employee_id)
        AND (_from_date IS NULL OR COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) >= _from_date)
        AND (_to_date IS NULL OR COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) <= _to_date)
        AND (_client_id IS NULL OR t.client_id = _client_id)
        AND (NULLIF(btrim(COALESCE(_task_search, '')), '') IS NULL OR t.title ILIKE '%' || btrim(_task_search) || '%')
        AND NOT EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id AND te.voided_at IS NULL)
    ), feed AS (
      SELECT * FROM work_rows UNION ALL SELECT * FROM absence_rows UNION ALL SELECT * FROM task_rows
    ), page AS (
      SELECT * FROM feed ORDER BY sort_at DESC NULLS LAST, id DESC LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*)::integer FROM feed),
      'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'company_id', x.company_id, 'task_id', x.task_id, 'user_id', x.user_id,
        'started_at', x.started_at, 'ended_at', x.ended_at, 'paused_at', x.paused_at, 'resumed_at', x.resumed_at,
        'effective_minutes', x.effective_minutes, 'notes', x.notes, 'created_at', x.created_at, 'updated_at', x.updated_at,
        'origin', x.origin, 'created_by', x.created_by, 'last_edited_by', x.last_edited_by, 'last_edited_at', x.last_edited_at,
        'last_edit_reason', x.last_edit_reason, 'voided_at', x.voided_at, 'voided_by', x.voided_by, 'void_reason', x.void_reason,
        'entry_kind', x.entry_kind, 'paid_leave_minutes', x.paid_leave_minutes, 'record_kind', x.record_kind,
        'absence_reason', x.absence_reason, 'absence_justified', x.absence_justified, 'absence_source', x.absence_source,
        'task_status', x.task_status, 'operational_status', x.operational_status,
        'no_start_reason', x.no_start_reason, 'no_start_reason_at', x.no_start_reason_at, 'no_start_reason_by', x.no_start_reason_by,
        'tasks', jsonb_build_object('title', x.task_title, 'client_id', x.client_id, 'scheduled_for', x.scheduled_for,
          'scheduled_end', x.scheduled_end, 'recurrence_date', x.recurrence_date, 'due_at', x.due_at),
        'profiles', jsonb_build_object('full_name', x.employee_name)
      ) ORDER BY x.sort_at DESC NULLS LAST, x.id DESC) FROM page), '[]'::jsonb)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.timesheet_operational_list(uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_operational_list(uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date, integer, integer) TO authenticated, service_role;
