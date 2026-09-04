-- Restaura o feed canónico da Folha de Ponto Gestão sem alterar dados.
-- Pontos reais são preservados; férias são um evento por período; tarefas futuras não entram como factos operacionais.
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
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.is_company_manager(v_uid, _company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT (_status = ANY (ARRAY['all', 'open', 'closed']::text[])) THEN RAISE EXCEPTION 'INVALID_STATUS_FILTER'; END IF;
  IF _limit < 1 OR _limit > 5000 OR _offset < 0 THEN RAISE EXCEPTION 'INVALID_PAGINATION'; END IF;

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
      LEFT JOIN public.tasks t ON t.id = te.task_id AND t.company_id = te.company_id
      JOIN public.profiles p ON p.id = te.user_id
      WHERE te.company_id = _company_id AND te.voided_at IS NULL
        AND (_employee_id IS NULL OR te.user_id = _employee_id)
        AND (_status = 'all' OR (_status = 'open' AND te.ended_at IS NULL) OR (_status = 'closed' AND te.ended_at IS NOT NULL))
        AND (_from_ts IS NULL OR te.started_at >= _from_ts) AND (_to_ts IS NULL OR te.started_at <= _to_ts)
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
        AND NOT EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id AND te.voided_at IS NULL)
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
        AND (t.status = 'em_andamento'
          OR (t.scheduled_for IS NOT NULL AND t.scheduled_for <= now())
          OR (t.scheduled_for IS NULL AND COALESCE(t.recurrence_date, t.due_at::date) <= CURRENT_DATE))
        AND (_employee_id IS NULL OR t.assigned_to = _employee_id)
        AND (_from_date IS NULL OR COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) >= _from_date)
        AND (_to_date IS NULL OR COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) <= _to_date)
        AND (_client_id IS NULL OR t.client_id = _client_id)
        AND (NULLIF(btrim(COALESCE(_task_search, '')), '') IS NULL OR t.title ILIKE '%' || btrim(_task_search) || '%')
        AND NOT EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id AND te.voided_at IS NULL)
    ), vacation_rows AS (
      SELECT vr.id, vr.company_id, NULL::uuid AS task_id, vr.user_id, NULL::timestamptz AS started_at,
        NULL::timestamptz AS ended_at, NULL::timestamptz AS paused_at, NULL::timestamptz AS resumed_at,
        NULL::integer AS effective_minutes,
        COALESCE(NULLIF(btrim(vr.note), ''), 'Férias aprovadas') ||
          CASE WHEN vr.end_date > vr.start_date THEN ' (' || to_char(vr.start_date, 'DD/MM/YYYY') || ' a ' || to_char(vr.end_date, 'DD/MM/YYYY') || ')' ELSE '' END AS notes,
        COALESCE(vr.decided_at, vr.updated_at, vr.created_at) AS created_at, vr.updated_at,
        'vacation'::text AS origin, vr.decided_by AS created_by, NULL::uuid AS last_edited_by,
        NULL::timestamptz AS last_edited_at, NULL::text AS last_edit_reason, NULL::timestamptz AS voided_at,
        NULL::uuid AS voided_by, NULL::text AS void_reason, NULL::text AS entry_kind,
        NULL::integer AS paid_leave_minutes, 'Férias'::text AS task_title, NULL::uuid AS client_id,
        NULL::timestamptz AS scheduled_for, NULL::timestamptz AS scheduled_end,
        vr.start_date AS recurrence_date, NULL::timestamptz AS due_at,
        p.full_name AS employee_name, 'vacation'::text AS record_kind,
        NULL::text AS absence_reason, NULL::boolean AS absence_justified, NULL::text AS absence_source,
        NULL::text AS task_status, 'vacation'::text AS operational_status,
        NULL::text AS no_start_reason, NULL::timestamptz AS no_start_reason_at, NULL::uuid AS no_start_reason_by,
        vr.start_date::timestamp AT TIME ZONE 'UTC' AS sort_at
      FROM public.vacation_requests vr
      JOIN public.profiles p ON p.id = vr.user_id
      WHERE vr.company_id = _company_id AND vr.status = 'aprovado' AND _status = 'all'
        AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.company_id = vr.company_id AND ur.user_id = vr.user_id)
        AND (_employee_id IS NULL OR vr.user_id = _employee_id)
        AND _client_id IS NULL
        AND (_from_date IS NULL OR vr.end_date >= _from_date)
        AND (_to_date IS NULL OR vr.start_date <= _to_date)
        AND (NULLIF(btrim(COALESCE(_task_search, '')), '') IS NULL OR 'Férias' ILIKE '%' || btrim(_task_search) || '%')
    ), feed AS (
      SELECT * FROM work_rows
      UNION ALL SELECT * FROM absence_rows
      UNION ALL SELECT * FROM task_rows
      UNION ALL SELECT * FROM vacation_rows
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
      ) ORDER BY x.sort_at DESC NULLS LAST, x.id DESC) FROM page AS x), '[]'::jsonb)
    ) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.timesheet_operational_list(uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_operational_list(uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';