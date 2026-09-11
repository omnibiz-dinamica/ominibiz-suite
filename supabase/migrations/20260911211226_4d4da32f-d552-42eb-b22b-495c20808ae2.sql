ALTER TABLE public.client_assignees
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'habitual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_assignees_assignment_type_check'
      AND conrelid = 'public.client_assignees'::regclass
  ) THEN
    ALTER TABLE public.client_assignees
      ADD CONSTRAINT client_assignees_assignment_type_check
      CHECK (assignment_type IN ('habitual', 'recurso'));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.recurrence_update(_id uuid, _payload jsonb, _scope text DEFAULT 'all'::text, _from_task uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.task_recurrences%ROWTYPE;
  v_cutoff_date date;
  v_count int := 0;
  v_new_time time;
  v_new_dur int;
  v_new_start date;
  v_new_end date;
  v_has_time bool := _payload ? 'scheduled_time';
  v_has_dur  bool := _payload ? 'duration_minutes';
BEGIN
  SELECT * INTO v_rec FROM public.task_recurrences WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recorrencia nao encontrada'; END IF;
  IF NOT public.is_company_manager(v_uid, v_rec.company_id) THEN
    RAISE EXCEPTION 'Apenas gestor pode editar';
  END IF;
  IF _scope NOT IN ('future','all') THEN
    RAISE EXCEPTION 'Escopo invalido para template: %', _scope;
  END IF;

  v_new_start := COALESCE(NULLIF(_payload->>'start_date','')::date, v_rec.start_date);
  v_new_end := CASE
    WHEN _payload ? 'end_date' THEN NULLIF(_payload->>'end_date','')::date
    ELSE v_rec.end_date
  END;

  IF v_new_end IS NOT NULL AND v_new_end < v_new_start THEN
    RAISE EXCEPTION 'Data final da recorrencia nao pode ser anterior a data inicial';
  END IF;

  UPDATE public.task_recurrences SET
    title                 = COALESCE(_payload->>'title', title),
    description           = CASE WHEN _payload ? 'description' THEN _payload->>'description' ELSE description END,
    assigned_to           = CASE WHEN _payload ? 'assigned_to' THEN NULLIF(_payload->>'assigned_to','')::uuid ELSE assigned_to END,
    priority              = COALESCE(_payload->>'priority', priority),
    location              = CASE WHEN _payload ? 'location' THEN _payload->>'location' ELSE location END,
    absence_grace_minutes = COALESCE((_payload->>'absence_grace_minutes')::int, absence_grace_minutes),
    punch_mode_override   = CASE WHEN _payload ? 'punch_mode_override' THEN NULLIF(_payload->>'punch_mode_override','')::punch_mode ELSE punch_mode_override END,
    scheduled_time        = CASE WHEN v_has_time THEN NULLIF(_payload->>'scheduled_time','')::time ELSE scheduled_time END,
    duration_minutes      = COALESCE((_payload->>'duration_minutes')::int, duration_minutes),
    start_date            = v_new_start,
    end_date              = v_new_end,
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
      WHEN v_has_time AND t.recurrence_date IS NOT NULL AND v_new_time IS NOT NULL
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz
      WHEN v_has_time AND v_new_time IS NULL
        THEN NULL
      ELSE t.scheduled_for END,
    scheduled_end = CASE
      WHEN (v_has_time OR v_has_dur) AND t.recurrence_date IS NOT NULL AND v_new_time IS NOT NULL AND COALESCE(v_new_dur, 0) > 0
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz + make_interval(mins => v_new_dur)
      WHEN v_has_time AND v_new_time IS NULL
        THEN NULL
      ELSE t.scheduled_end END,
    due_at = CASE
      WHEN (v_has_time OR v_has_dur) AND t.recurrence_date IS NOT NULL AND v_new_time IS NULL
        THEN (t.recurrence_date::timestamp + interval '1 day' - interval '1 second') AT TIME ZONE 'UTC'
      WHEN (v_has_time OR v_has_dur) AND t.recurrence_date IS NOT NULL AND v_new_time IS NOT NULL AND COALESCE(v_new_dur, 0) > 0
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz + make_interval(mins => v_new_dur)
      WHEN v_has_time AND t.recurrence_date IS NOT NULL AND v_new_time IS NOT NULL
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz
      ELSE t.due_at END,
    updated_at = now()
  WHERE t.recurrence_id = _id
    AND t.status IN ('pendente','autorizado')
    AND COALESCE(t.recurrence_date, CURRENT_DATE) >= v_cutoff_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.tasks t
  WHERE t.recurrence_id = _id
    AND t.status IN ('pendente','autorizado')
    AND t.recurrence_date IS NOT NULL
    AND t.recurrence_date >= CURRENT_DATE
    AND (
      t.recurrence_date < v_new_start
      OR (v_new_end IS NOT NULL AND t.recurrence_date > v_new_end)
    )
    AND NOT EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id);

  RETURN v_count;
END
$function$;