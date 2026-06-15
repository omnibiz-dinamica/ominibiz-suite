
CREATE OR REPLACE FUNCTION public.punch_admin_create(_payload jsonb, _reason text)
 RETURNS time_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_user_id uuid;
  v_task_id uuid;
  v_started timestamptz;
  v_ended timestamptz;
  v_paused timestamptz;
  v_resumed timestamptz;
  v_notes text;
  v_eff int;
  v_total_sec numeric;
  v_pause_sec numeric;
  v_entry public.time_entries%ROWTYPE;
  v_reason text := NULLIF(trim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  v_task_id := NULLIF(_payload->>'task_id','')::uuid;
  v_user_id := NULLIF(_payload->>'user_id','')::uuid;
  v_started := (_payload->>'started_at')::timestamptz;
  v_ended := NULLIF(_payload->>'ended_at','')::timestamptz;
  v_paused := NULLIF(_payload->>'paused_at','')::timestamptz;
  v_resumed := NULLIF(_payload->>'resumed_at','')::timestamptz;
  v_notes := _payload->>'notes';

  IF v_task_id IS NULL OR v_user_id IS NULL OR v_started IS NULL THEN
    RAISE EXCEPTION 'task_id, user_id e started_at são obrigatórios';
  END IF;

  SELECT company_id INTO v_company_id FROM public.tasks WHERE id = v_task_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  IF NOT (public.is_super_admin(v_uid) OR public.is_company_manager(v_uid, v_company_id)) THEN
    RAISE EXCEPTION 'Apenas gestor pode criar ponto';
  END IF;

  IF NOT public.is_company_member(v_user_id, v_company_id) THEN
    RAISE EXCEPTION 'Usuário não pertence à empresa da tarefa';
  END IF;

  IF v_ended IS NOT NULL AND v_ended < v_started THEN
    RAISE EXCEPTION 'ended_at não pode ser anterior a started_at';
  END IF;
  IF v_paused IS NOT NULL AND (v_paused < v_started OR (v_ended IS NOT NULL AND v_paused > v_ended)) THEN
    RAISE EXCEPTION 'paused_at fora do intervalo';
  END IF;
  IF v_resumed IS NOT NULL AND (v_paused IS NULL OR v_resumed < v_paused) THEN
    RAISE EXCEPTION 'resumed_at inválido';
  END IF;

  IF v_ended IS NOT NULL THEN
    v_total_sec := EXTRACT(EPOCH FROM (v_ended - v_started));
    v_pause_sec := 0;
    IF v_paused IS NOT NULL THEN
      v_pause_sec := EXTRACT(EPOCH FROM (COALESCE(v_resumed, v_ended) - v_paused));
    END IF;
    v_eff := public.effective_minutes_round(v_total_sec, v_pause_sec);
  END IF;

  INSERT INTO public.time_entries (
    company_id, task_id, user_id, started_at, ended_at,
    paused_at, resumed_at, notes, effective_minutes,
    origin, created_by, last_edited_by, last_edited_at, last_edit_reason
  ) VALUES (
    v_company_id, v_task_id, v_user_id, v_started, v_ended,
    v_paused, v_resumed, v_notes, v_eff,
    'manager_manual', v_uid, v_uid, now(), v_reason
  ) RETURNING * INTO v_entry;

  INSERT INTO public.time_entries_audit (time_entry_id, company_id, action, changed_by, reason, changes)
  VALUES (v_entry.id, v_company_id, 'create', v_uid, COALESCE(v_reason, ''),
    jsonb_build_object(
      'started_at', jsonb_build_object('old', null, 'new', v_started),
      'ended_at', jsonb_build_object('old', null, 'new', v_ended),
      'paused_at', jsonb_build_object('old', null, 'new', v_paused),
      'resumed_at', jsonb_build_object('old', null, 'new', v_resumed),
      'effective_minutes', jsonb_build_object('old', null, 'new', v_eff),
      'notes', jsonb_build_object('old', null, 'new', v_notes)
    )
  );

  RETURN v_entry;
END $function$;

CREATE OR REPLACE FUNCTION public.punch_admin_update(_id uuid, _payload jsonb, _reason text)
 RETURNS time_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.time_entries%ROWTYPE;
  v_new public.time_entries%ROWTYPE;
  v_changes jsonb := '{}'::jsonb;
  v_started timestamptz;
  v_ended timestamptz;
  v_paused timestamptz;
  v_resumed timestamptz;
  v_notes text;
  v_eff int;
  v_total_sec numeric;
  v_pause_sec numeric;
  v_recalc boolean := false;
  v_eff_override boolean := false;
  v_new_origin text;
  v_reason text := NULLIF(trim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_old FROM public.time_entries WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;

  IF NOT (public.is_super_admin(v_uid) OR public.is_company_manager(v_uid, v_old.company_id)) THEN
    RAISE EXCEPTION 'Apenas gestor pode editar';
  END IF;

  v_started := CASE WHEN _payload ? 'started_at' THEN (_payload->>'started_at')::timestamptz ELSE v_old.started_at END;
  v_ended := CASE WHEN _payload ? 'ended_at' THEN NULLIF(_payload->>'ended_at','')::timestamptz ELSE v_old.ended_at END;
  v_paused := CASE WHEN _payload ? 'paused_at' THEN NULLIF(_payload->>'paused_at','')::timestamptz ELSE v_old.paused_at END;
  v_resumed := CASE WHEN _payload ? 'resumed_at' THEN NULLIF(_payload->>'resumed_at','')::timestamptz ELSE v_old.resumed_at END;
  v_notes := CASE WHEN _payload ? 'notes' THEN _payload->>'notes' ELSE v_old.notes END;

  IF _payload ? 'effective_minutes' THEN
    v_eff := NULLIF(_payload->>'effective_minutes','')::int;
    v_eff_override := true;
  ELSE
    v_eff := v_old.effective_minutes;
  END IF;

  IF v_ended IS NOT NULL AND v_ended < v_started THEN
    RAISE EXCEPTION 'ended_at não pode ser anterior a started_at';
  END IF;
  IF v_paused IS NOT NULL AND (v_paused < v_started OR (v_ended IS NOT NULL AND v_paused > v_ended)) THEN
    RAISE EXCEPTION 'paused_at fora do intervalo';
  END IF;
  IF v_resumed IS NOT NULL AND (v_paused IS NULL OR v_resumed < v_paused) THEN
    RAISE EXCEPTION 'resumed_at inválido';
  END IF;

  IF NOT v_eff_override AND v_ended IS NOT NULL AND (
       v_started IS DISTINCT FROM v_old.started_at
    OR v_ended IS DISTINCT FROM v_old.ended_at
    OR v_paused IS DISTINCT FROM v_old.paused_at
    OR v_resumed IS DISTINCT FROM v_old.resumed_at
  ) THEN
    v_total_sec := EXTRACT(EPOCH FROM (v_ended - v_started));
    v_pause_sec := 0;
    IF v_paused IS NOT NULL THEN
      v_pause_sec := EXTRACT(EPOCH FROM (COALESCE(v_resumed, v_ended) - v_paused));
    END IF;
    v_eff := public.effective_minutes_round(v_total_sec, v_pause_sec);
    v_recalc := true;
  END IF;

  IF v_started IS DISTINCT FROM v_old.started_at THEN
    v_changes := v_changes || jsonb_build_object('started_at', jsonb_build_object('old', v_old.started_at, 'new', v_started));
  END IF;
  IF v_ended IS DISTINCT FROM v_old.ended_at THEN
    v_changes := v_changes || jsonb_build_object('ended_at', jsonb_build_object('old', v_old.ended_at, 'new', v_ended));
  END IF;
  IF v_paused IS DISTINCT FROM v_old.paused_at THEN
    v_changes := v_changes || jsonb_build_object('paused_at', jsonb_build_object('old', v_old.paused_at, 'new', v_paused));
  END IF;
  IF v_resumed IS DISTINCT FROM v_old.resumed_at THEN
    v_changes := v_changes || jsonb_build_object('resumed_at', jsonb_build_object('old', v_old.resumed_at, 'new', v_resumed));
  END IF;
  IF v_notes IS DISTINCT FROM v_old.notes THEN
    v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('old', v_old.notes, 'new', v_notes));
  END IF;
  IF v_eff IS DISTINCT FROM v_old.effective_minutes THEN
    v_changes := v_changes || jsonb_build_object('effective_minutes', jsonb_build_object('old', v_old.effective_minutes, 'new', v_eff));
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nada a alterar';
  END IF;

  v_new_origin := CASE WHEN v_old.origin = 'employee_punch' THEN 'manager_correction' ELSE v_old.origin END;

  UPDATE public.time_entries SET
    started_at = v_started,
    ended_at = v_ended,
    paused_at = v_paused,
    resumed_at = v_resumed,
    notes = v_notes,
    effective_minutes = v_eff,
    origin = v_new_origin,
    last_edited_by = v_uid,
    last_edited_at = now(),
    last_edit_reason = v_reason,
    updated_at = now()
  WHERE id = _id
  RETURNING * INTO v_new;

  INSERT INTO public.time_entries_audit (time_entry_id, company_id, action, changed_by, reason, changes)
  VALUES (_id, v_old.company_id, 'update', v_uid, COALESCE(v_reason, ''), v_changes);

  RETURN v_new;
END $function$;
