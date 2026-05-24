-- Edit recurrence series & single occurrence (scope-aware)

CREATE OR REPLACE FUNCTION public.recurrence_update_occurrence(_task_id uuid, _payload jsonb)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;
  IF NOT public.is_company_manager(v_uid, v_task.company_id) THEN
    RAISE EXCEPTION 'Apenas gestor pode editar';
  END IF;
  IF v_task.status NOT IN ('pendente','autorizado') THEN
    RAISE EXCEPTION 'Tarefa em status % não pode ser editada', v_task.status;
  END IF;

  UPDATE public.tasks SET
    title                 = COALESCE(_payload->>'title', title),
    description           = CASE WHEN _payload ? 'description' THEN _payload->>'description' ELSE description END,
    assigned_to           = CASE WHEN _payload ? 'assigned_to' THEN NULLIF(_payload->>'assigned_to','')::uuid ELSE assigned_to END,
    priority              = COALESCE((_payload->>'priority')::task_priority, priority),
    location              = CASE WHEN _payload ? 'location' THEN _payload->>'location' ELSE location END,
    absence_grace_minutes = COALESCE((_payload->>'absence_grace_minutes')::int, absence_grace_minutes),
    punch_mode_override   = CASE WHEN _payload ? 'punch_mode_override' THEN NULLIF(_payload->>'punch_mode_override','')::punch_mode ELSE punch_mode_override END,
    scheduled_for         = COALESCE((_payload->>'scheduled_for')::timestamptz, scheduled_for),
    scheduled_end         = COALESCE((_payload->>'scheduled_end')::timestamptz, scheduled_end),
    updated_at            = now()
  WHERE id = _task_id
  RETURNING * INTO v_task;

  RETURN v_task;
END $$;


CREATE OR REPLACE FUNCTION public.recurrence_update(
  _id uuid,
  _payload jsonb,
  _scope text DEFAULT 'all',
  _from_task uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.task_recurrences%ROWTYPE;
  v_cutoff_date date;
  v_count int := 0;
  v_new_time time;
  v_new_dur int;
  v_has_time bool := _payload ? 'scheduled_time';
  v_has_dur  bool := _payload ? 'duration_minutes';
BEGIN
  SELECT * INTO v_rec FROM public.task_recurrences WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada'; END IF;
  IF NOT public.is_company_manager(v_uid, v_rec.company_id) THEN
    RAISE EXCEPTION 'Apenas gestor pode editar';
  END IF;
  IF _scope NOT IN ('future','all') THEN
    RAISE EXCEPTION 'Escopo inválido para template: %', _scope;
  END IF;

  UPDATE public.task_recurrences SET
    title                 = COALESCE(_payload->>'title', title),
    description           = CASE WHEN _payload ? 'description' THEN _payload->>'description' ELSE description END,
    assigned_to           = CASE WHEN _payload ? 'assigned_to' THEN NULLIF(_payload->>'assigned_to','')::uuid ELSE assigned_to END,
    priority              = COALESCE(_payload->>'priority', priority),
    location              = CASE WHEN _payload ? 'location' THEN _payload->>'location' ELSE location END,
    absence_grace_minutes = COALESCE((_payload->>'absence_grace_minutes')::int, absence_grace_minutes),
    punch_mode_override   = CASE WHEN _payload ? 'punch_mode_override' THEN NULLIF(_payload->>'punch_mode_override','')::punch_mode ELSE punch_mode_override END,
    scheduled_time        = COALESCE((_payload->>'scheduled_time')::time, scheduled_time),
    duration_minutes      = COALESCE((_payload->>'duration_minutes')::int, duration_minutes),
    updated_at            = now()
  WHERE id = _id
  RETURNING scheduled_time, duration_minutes INTO v_new_time, v_new_dur;

  IF _scope = 'future' THEN
    IF _from_task IS NOT NULL THEN
      SELECT COALESCE(recurrence_date, CURRENT_DATE) INTO v_cutoff_date FROM public.tasks WHERE id = _from_task;
    ELSE
      v_cutoff_date := CURRENT_DATE;
    END IF;
  ELSE
    v_cutoff_date := '-infinity'::date;
  END IF;

  UPDATE public.tasks t SET
    title                 = COALESCE(_payload->>'title', t.title),
    description           = CASE WHEN _payload ? 'description' THEN _payload->>'description' ELSE t.description END,
    assigned_to           = CASE WHEN _payload ? 'assigned_to' THEN NULLIF(_payload->>'assigned_to','')::uuid ELSE t.assigned_to END,
    priority              = COALESCE((_payload->>'priority')::task_priority, t.priority),
    location              = CASE WHEN _payload ? 'location' THEN _payload->>'location' ELSE t.location END,
    absence_grace_minutes = COALESCE((_payload->>'absence_grace_minutes')::int, t.absence_grace_minutes),
    punch_mode_override   = CASE WHEN _payload ? 'punch_mode_override' THEN NULLIF(_payload->>'punch_mode_override','')::punch_mode ELSE t.punch_mode_override END,
    scheduled_for = CASE
      WHEN v_has_time AND t.recurrence_date IS NOT NULL
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz
      ELSE t.scheduled_for END,
    scheduled_end = CASE
      WHEN (v_has_time OR v_has_dur) AND t.recurrence_date IS NOT NULL
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz + make_interval(mins => v_new_dur)
      ELSE t.scheduled_end END,
    updated_at = now()
  WHERE t.recurrence_id = _id
    AND t.status IN ('pendente','autorizado')
    AND COALESCE(t.recurrence_date, CURRENT_DATE) >= v_cutoff_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END $$;