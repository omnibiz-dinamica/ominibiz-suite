CREATE OR REPLACE FUNCTION public.punch_start_v2(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task uuid := (p_input->>'task_id')::uuid;
  v_company uuid;
  v_client uuid;
  v_pol jsonb;
  v_eval jsonb;
  v_policy_version integer;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_gps  text := COALESCE(p_input->>'gps_status','ok');
  v_cap  timestamptz := NULLIF(p_input->>'captured_at','')::timestamptz;
  v_dev  jsonb := COALESCE(p_input->'device_fingerprint','{}'::jsonb);
  v_reason text := NULLIF(p_input->>'reason_text','');
  v_entry public.time_entries;
  v_other public.time_entries;
  v_other_title text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Sessao invalida','data',null);
  END IF;
  IF v_task IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_INPUT','message','task_id obrigatorio','data',null);
  END IF;

  SELECT t.company_id, t.client_id INTO v_company, v_client
    FROM public.tasks t WHERE t.id = v_task;
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','TASK_NOT_FOUND','message','Tarefa nao encontrada','data',null);
  END IF;

  SELECT * INTO v_entry FROM public.time_entries
   WHERE user_id = v_uid AND task_id = v_task AND ended_at IS NULL
   ORDER BY started_at DESC LIMIT 1;

  IF v_entry.id IS NOT NULL AND public._punch_state(v_entry) IN ('start','arrival') THEN
    IF v_entry.started_at > now() - interval '20 seconds' THEN
      RETURN jsonb_build_object(
        'success',true,'code','PUNCH_STARTED','message','Ja iniciado (idempotente)',
        'data', jsonb_build_object('time_entry_id', v_entry.id, 'idempotent', true)
      );
    END IF;
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Tarefa ja iniciada. Finalize antes de iniciar novamente.','data',null);
  END IF;

  -- Guarda: ponto aberto noutra tarefa (evita violacao de uniq_open_punch_per_user
  -- que chegava ao cliente como erro tecnico generico).
  SELECT * INTO v_other FROM public.time_entries
   WHERE user_id = v_uid AND ended_at IS NULL AND task_id IS DISTINCT FROM v_task
   ORDER BY started_at DESC LIMIT 1;

  IF v_other.id IS NOT NULL THEN
    SELECT t.title INTO v_other_title FROM public.tasks t WHERE t.id = v_other.task_id;
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ENTRY_ALREADY_OPEN',
      'message', 'Existe um ponto aberto' ||
                 COALESCE(' na tarefa "' || v_other_title || '"', '') ||
                 '. Finalize esse ponto antes de iniciar outra tarefa.',
      'data', jsonb_build_object(
        'time_entry_id', v_other.id,
        'task_id', v_other.task_id,
        'task_title', v_other_title,
        'started_at', v_other.started_at
      )
    );
  END IF;

  v_pol := public._punch_resolve_policy(v_company, v_client);
  v_policy_version := COALESCE((v_pol->>'version')::int, 1);

  v_eval := public._punch_evaluate_geo(
    v_lat, v_lng, v_acc, v_gps,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_pol->>'policy_start')::geo_policy,
    (v_pol->>'no_loc_start')::geo_policy,
    (v_pol->>'required_start')::boolean,
    v_reason
  );

  IF v_eval->>'decision' = 'reject' THEN
    RETURN jsonb_build_object('success',false,
      'code', v_eval->>'reason_code',
      'message','Localizacao fora do raio permitido - politica bloqueia inicio.',
      'data', jsonb_build_object('distance_m', v_eval->'distance_m'));
  END IF;
  IF v_eval->>'decision' = 'needs_reason' THEN
    RETURN jsonb_build_object('success',false,'code','NEEDS_JUSTIFICATION',
      'message','Justificativa obrigatoria para iniciar fora do raio.','data',null);
  END IF;

  INSERT INTO public.time_entries(company_id, task_id, user_id, started_at, created_by,
    start_geo_status, start_geo_reason_code, start_geo_reason_text, geo_policy_version)
  VALUES (v_company, v_task, v_uid, now(), v_uid,
    (v_eval->>'status')::geo_status,
    (v_eval->>'reason_code')::geo_reason_code,
    v_reason,
    v_policy_version
  ) RETURNING * INTO v_entry;

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_company, v_uid, 'start', v_cap,
    v_lat, v_lng, v_acc,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_eval->>'status')::geo_status,
    (v_eval->>'reason_code')::geo_reason_code,
    v_reason, v_policy_version, v_dev, true
  );

  UPDATE public.tasks
     SET status = 'em_andamento',
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE id = v_task
     AND status IN ('pendente', 'autorizado', 'ausente');

  RETURN jsonb_build_object(
    'success',true,'code','PUNCH_STARTED','message','Ponto iniciado.',
    'data', jsonb_build_object(
      'time_entry_id', v_entry.id,
      'geo_status', v_eval->>'status',
      'reason_code', v_eval->>'reason_code',
      'distance_m', v_eval->'distance_m',
      'geo_policy_version', v_policy_version
    )
  );
END $function$;

CREATE OR REPLACE FUNCTION public.task_transition(_task_id uuid, _action text, _reason text DEFAULT NULL::text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_uid UUID := auth.uid();
  v_is_manager BOOLEAN;
  v_is_assignee BOOLEAN;
  v_open_id UUID;
  v_punch_user UUID;
  v_started TIMESTAMPTZ;
  v_paused TIMESTAMPTZ;
  v_resumed TIMESTAMPTZ;
  v_total_sec NUMERIC;
  v_pause_sec NUMERIC;
  v_reason TEXT := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := (v_task.assigned_to = v_uid);

  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissao para esta tarefa';
  END IF;

  IF _action = 'autorizar' THEN
    IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode autorizar'; END IF;
    IF v_task.status <> 'pendente' THEN RAISE EXCEPTION 'So e possivel autorizar tarefa pendente'; END IF;
    UPDATE public.tasks SET status = 'autorizado', authorized_at = now(), authorized_by = v_uid
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'iniciar' THEN
    IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissao'; END IF;

    v_punch_user := v_task.assigned_to;
    IF v_punch_user IS NULL THEN
      RAISE EXCEPTION 'Tarefa precisa de um responsavel antes de iniciar';
    END IF;

    SELECT id INTO v_open_id FROM public.time_entries
     WHERE user_id = v_punch_user
       AND task_id = v_task.id
       AND ended_at IS NULL
     LIMIT 1;

    IF v_task.status = 'em_andamento' AND v_open_id IS NOT NULL THEN
      RETURN v_task;
    END IF;

    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Tarefa nao pode ser iniciada no status atual: %', v_task.status;
    END IF;

    SELECT id INTO v_open_id FROM public.time_entries
     WHERE user_id = v_punch_user AND ended_at IS NULL
     LIMIT 1;
    IF v_open_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ja existe um ponto aberto para este usuario. Conclua-o antes de iniciar outra tarefa.';
    END IF;

    UPDATE public.tasks SET status = 'em_andamento', started_at = COALESCE(started_at, now())
      WHERE id = _task_id RETURNING * INTO v_task;

    INSERT INTO public.time_entries (company_id, task_id, user_id, started_at)
    VALUES (v_task.company_id, v_task.id, v_punch_user, now());

  ELSIF _action = 'recusar' THEN
    IF NOT v_is_assignee THEN RAISE EXCEPTION 'Apenas o responsavel pode recusar a tarefa'; END IF;
    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode ser recusada';
    END IF;
    IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da recusa obrigatorio'; END IF;
    UPDATE public.tasks
       SET status = 'cancelado',
           cancelled_at = now(),
           cancelled_by = v_uid,
           refusal_reason = v_reason,
           refused_at = now(),
           refused_by = v_uid
     WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action IN ('concluir','cancelar','marcar_ausente') THEN
    IF _action = 'concluir' THEN
      IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissao'; END IF;
      IF v_task.status <> 'em_andamento' THEN
        RAISE EXCEPTION 'Apenas tarefa em andamento pode ser concluida';
      END IF;
      UPDATE public.tasks SET status = 'concluido', completed_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSIF _action = 'cancelar' THEN
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode cancelar'; END IF;
      IF v_task.status IN ('concluido','cancelado','ausente') THEN
        RAISE EXCEPTION 'Tarefa ja finalizada';
      END IF;
      UPDATE public.tasks SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSE
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode marcar ausencia'; END IF;
      IF public.task_timing_is_manual(v_task.client_id) THEN
        RAISE EXCEPTION 'Cliente em modo de apontamento manual nao permite marcacao de ausencia';
      END IF;
      IF v_task.status NOT IN ('pendente','autorizado') THEN
        RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode virar ausente';
      END IF;
      UPDATE public.tasks SET status = 'ausente', marked_absent_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    END IF;

    FOR v_open_id, v_started, v_paused, v_resumed IN
      SELECT id, started_at, paused_at, resumed_at
        FROM public.time_entries
       WHERE task_id = v_task.id AND ended_at IS NULL
    LOOP
      v_pause_sec := 0;
      IF v_paused IS NOT NULL AND v_resumed IS NULL THEN
        v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_paused)));
      ELSIF v_paused IS NOT NULL AND v_resumed IS NOT NULL THEN
        v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_resumed - v_paused)));
      END IF;
      v_total_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_started)) - v_pause_sec);

      UPDATE public.time_entries
         SET ended_at = now(),
             effective_minutes = public.effective_minutes_round(v_total_sec, 0)
       WHERE id = v_open_id;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Acao invalida: %', _action;
  END IF;

  RETURN v_task;
END
$function$;