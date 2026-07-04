
-- ============================================================
-- Geofencing v1.0 — Passo 2: RPCs (punch_*_v2)
-- ============================================================
-- Contrato uniforme: retornam JSONB { success, code, message, data }.
-- Regras: máquina de estados, idempotência, tempo do servidor,
-- log de tentativas rejeitadas (marcador em reason_text), validação
-- em transação única. Não altera RPCs existentes.
-- ============================================================

-- Marker constante para tentativas rejeitadas (persistido em reason_text)
-- Filtrado nas leituras de estado para não corromper o histórico "aceito".
-- Ex.: '__REJECTED__:OUT_OF_RADIUS'

-- ------------------------------------------------------------
-- Helper: última "boa" (aceita) event_kind de um time_entry
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._punch_last_accepted_event(p_entry_id uuid)
RETURNS punch_event_kind
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT event_kind
    FROM public.time_entry_geopoints
   WHERE time_entry_id = p_entry_id
     AND (reason_text IS NULL OR reason_text NOT LIKE '\_\_REJECTED\_\_%' ESCAPE '\')
   ORDER BY server_at DESC
   LIMIT 1
$$;

-- ------------------------------------------------------------
-- Helper: estado lógico do entry
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._punch_state(p_entry public.time_entries)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last punch_event_kind;
BEGIN
  IF p_entry.id IS NULL THEN RETURN 'none'; END IF;
  v_last := public._punch_last_accepted_event(p_entry.id);

  IF p_entry.ended_at IS NOT NULL THEN
    IF v_last = 'departure' THEN RETURN 'departure'; END IF;
    RETURN 'stop';
  END IF;

  IF p_entry.paused_at IS NOT NULL
     AND (p_entry.resumed_at IS NULL OR p_entry.resumed_at < p_entry.paused_at) THEN
    RETURN 'pause';
  END IF;

  IF v_last = 'arrival' THEN RETURN 'arrival'; END IF;
  RETURN 'start';
END $$;

-- ------------------------------------------------------------
-- Helper: resolve políticas efetivas (cliente > empresa)
-- Retorna JSONB com radius, policy_start, policy_stop, no_loc_start/stop,
-- version, client_lat, client_lng, geo_required_start/stop.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._punch_resolve_policy(p_company uuid, p_client uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'radius_m', COALESCE(c.geo_radius_m, s.geo_default_radius_m, 50),
    'client_lat', c.geo_lat,
    'client_lng', c.geo_lng,
    'policy_start', COALESCE(s.geo_out_of_range_policy_start, 'alert'::geo_policy),
    'policy_stop',  COALESCE(s.geo_out_of_range_policy_stop,  'alert'::geo_policy),
    'no_loc_start', COALESCE(s.geo_no_location_policy_start, 'alert'::geo_policy),
    'no_loc_stop',  COALESCE(s.geo_no_location_policy_stop,  'alert'::geo_policy),
    'required_start', COALESCE(s.geo_required_start, false),
    'required_stop',  COALESCE(s.geo_required_stop, false),
    'version', COALESCE(s.geo_policy_version, 1)
  )
    FROM public.company_hr_settings s
    LEFT JOIN public.clients c ON c.id = p_client AND c.company_id = p_company
   WHERE s.company_id = p_company
$$;

-- ------------------------------------------------------------
-- Helper: registra ponto no time_entry_geopoints (append-only)
-- p_accepted=false → prefixa reason_text com __REJECTED__:<code>
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._punch_log_geopoint(
  p_entry_id       uuid,
  p_company_id     uuid,
  p_user_id        uuid,
  p_event_kind     punch_event_kind,
  p_captured_at    timestamptz,
  p_lat            double precision,
  p_lng            double precision,
  p_accuracy_m     double precision,
  p_client_lat     double precision,
  p_client_lng     double precision,
  p_client_radius  integer,
  p_geo_status     geo_status,
  p_reason_code    geo_reason_code,
  p_reason_text    text,
  p_policy_version integer,
  p_device         jsonb,
  p_accepted       boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_dist double precision;
  v_text text;
BEGIN
  v_dist := CASE
    WHEN p_lat IS NULL OR p_lng IS NULL OR p_client_lat IS NULL OR p_client_lng IS NULL
      THEN NULL
    ELSE public.haversine_m(p_lat, p_lng, p_client_lat, p_client_lng)
  END;
  v_text := CASE
    WHEN p_accepted THEN p_reason_text
    ELSE '__REJECTED__:' || COALESCE(p_reason_code::text,'UNKNOWN') ||
         CASE WHEN p_reason_text IS NOT NULL THEN ' ' || p_reason_text ELSE '' END
  END;

  INSERT INTO public.time_entry_geopoints(
    time_entry_id, company_id, user_id, event_kind,
    captured_at, server_at,
    lat, lng, accuracy_m,
    client_lat, client_lng, client_radius_m, distance_m,
    geo_status, reason_code, reason_text,
    location_source, geo_policy_version, device_fingerprint,
    mock_location_suspected
  ) VALUES (
    p_entry_id, p_company_id, p_user_id, p_event_kind,
    COALESCE(p_captured_at, now()), now(),
    p_lat, p_lng, p_accuracy_m,
    p_client_lat, p_client_lng, p_client_radius, v_dist,
    p_geo_status, p_reason_code, v_text,
    'gps'::location_source, p_policy_version, p_device,
    false
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============================================================
-- Núcleo comum: avaliar geolocalização vs política start/stop
-- ============================================================
-- Retorna JSONB com { status, reason_code, decision, distance_m }
-- decision ∈ ('accept','reject','needs_reason')
CREATE OR REPLACE FUNCTION public._punch_evaluate_geo(
  p_lat double precision, p_lng double precision, p_accuracy_m double precision,
  p_gps_status text,       -- 'ok'|'denied'|'timeout'|'no_location'
  p_client_lat double precision, p_client_lng double precision,
  p_radius integer,
  p_policy geo_policy,
  p_no_loc_policy geo_policy,
  p_required boolean,
  p_reason_text text
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_dist double precision;
  v_status geo_status;
  v_code geo_reason_code;
  v_policy geo_policy;
  v_decision text;
BEGIN
  -- Sem localização
  IF p_gps_status <> 'ok' OR p_lat IS NULL OR p_lng IS NULL THEN
    v_status := 'no_location';
    v_code := CASE p_gps_status
      WHEN 'denied'  THEN 'GPS_DENIED'::geo_reason_code
      WHEN 'timeout' THEN 'GPS_TIMEOUT'::geo_reason_code
      ELSE 'NO_GPS'::geo_reason_code
    END;
    v_policy := p_no_loc_policy;
  ELSIF p_client_lat IS NULL OR p_client_lng IS NULL THEN
    -- Cliente sem coordenadas: registra dentro (nada a validar)
    v_status := 'within';
    v_code := 'CLIENT_WITHOUT_LOCATION'::geo_reason_code;
    v_policy := 'alert'::geo_policy;
  ELSE
    v_dist := public.haversine_m(p_lat, p_lng, p_client_lat, p_client_lng);
    IF v_dist <= COALESCE(p_radius,50) THEN
      v_status := 'within';
      v_code := 'WITHIN_RADIUS'::geo_reason_code;
      v_policy := 'alert'::geo_policy;
    ELSE
      v_status := 'out_of_range';
      v_code := 'OUT_OF_RADIUS'::geo_reason_code;
      v_policy := p_policy;
    END IF;
  END IF;

  -- Empresa exige localização e não temos → tratar como bloqueio se policy=block
  IF v_status = 'no_location' AND p_required AND v_policy IS NULL THEN
    v_policy := 'block';
  END IF;

  -- Decisão
  IF v_status = 'within' THEN
    v_decision := 'accept';
  ELSIF v_policy = 'block' THEN
    v_decision := 'reject';
  ELSIF v_policy = 'justify' AND (p_reason_text IS NULL OR btrim(p_reason_text)='') THEN
    v_decision := 'needs_reason';
  ELSE
    v_decision := 'accept';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'reason_code', v_code,
    'decision', v_decision,
    'distance_m', v_dist
  );
END $$;

-- ============================================================
-- RPC: punch_start_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_start_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task uuid := (p_input->>'task_id')::uuid;
  v_company uuid;
  v_client uuid;
  v_pol jsonb;
  v_eval jsonb;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_gps  text := COALESCE(p_input->>'gps_status','ok');
  v_cap  timestamptz := NULLIF(p_input->>'captured_at','')::timestamptz;
  v_dev  jsonb := COALESCE(p_input->'device_fingerprint','{}'::jsonb);
  v_reason text := NULLIF(p_input->>'reason_text','');
  v_entry public.time_entries;
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Sessão inválida','data',null);
  END IF;
  IF v_task IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_INPUT','message','task_id obrigatório','data',null);
  END IF;

  SELECT t.company_id, t.client_id INTO v_company, v_client
    FROM public.tasks t WHERE t.id = v_task;
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','TASK_NOT_FOUND','message','Tarefa não encontrada','data',null);
  END IF;

  -- Idempotência: entry aberto do mesmo user+task nos últimos 20s
  SELECT * INTO v_entry FROM public.time_entries
   WHERE user_id = v_uid AND task_id = v_task AND ended_at IS NULL
   ORDER BY started_at DESC LIMIT 1;

  IF v_entry.id IS NOT NULL AND public._punch_state(v_entry) IN ('start','arrival') THEN
    IF v_entry.started_at > now() - interval '20 seconds' THEN
      RETURN jsonb_build_object(
        'success',true,'code','PUNCH_STARTED','message','Já iniciado (idempotente)',
        'data', jsonb_build_object('time_entry_id', v_entry.id, 'idempotent', true)
      );
    END IF;
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Tarefa já iniciada. Finalize antes de iniciar novamente.','data',null);
  END IF;

  v_pol := public._punch_resolve_policy(v_company, v_client);
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
      'message','Localização fora do raio permitido — política bloqueia início.',
      'data', jsonb_build_object('distance_m', v_eval->'distance_m'));
  END IF;
  IF v_eval->>'decision' = 'needs_reason' THEN
    RETURN jsonb_build_object('success',false,'code','NEEDS_JUSTIFICATION',
      'message','Justificativa obrigatória para iniciar fora do raio.','data',null);
  END IF;

  -- Cria time_entry (started_at=now()) + geopoint
  INSERT INTO public.time_entries(company_id, task_id, user_id, started_at, created_by,
    start_geo_status, start_geo_reason_code, start_geo_reason_text, geo_policy_version)
  VALUES (v_company, v_task, v_uid, now(), v_uid,
    (v_eval->>'status')::geo_status,
    (v_eval->>'reason_code')::geo_reason_code,
    v_reason,
    (v_pol->>'version')::int
  ) RETURNING * INTO v_entry;

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_company, v_uid, 'start', v_cap,
    v_lat, v_lng, v_acc,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_eval->>'status')::geo_status,
    (v_eval->>'reason_code')::geo_reason_code,
    v_reason, (v_pol->>'version')::int, v_dev, true
  );

  RETURN jsonb_build_object(
    'success',true,'code','PUNCH_STARTED','message','Ponto iniciado.',
    'data', jsonb_build_object(
      'time_entry_id', v_entry.id,
      'geo_status', v_eval->>'status',
      'reason_code', v_eval->>'reason_code',
      'distance_m', v_eval->'distance_m'
    )
  );
END $$;

-- ============================================================
-- RPC: punch_stop_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_stop_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_client uuid;
  v_pol jsonb;
  v_eval jsonb;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_gps  text := COALESCE(p_input->>'gps_status','ok');
  v_cap  timestamptz := NULLIF(p_input->>'captured_at','')::timestamptz;
  v_dev  jsonb := COALESCE(p_input->'device_fingerprint','{}'::jsonb);
  v_reason text := NULLIF(p_input->>'reason_text','');
  v_state text;
  v_minutes int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Sessão inválida','data',null);
  END IF;

  SELECT * INTO v_entry FROM public.time_entries WHERE id = v_entry_id AND user_id = v_uid;
  IF v_entry.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','ENTRY_NOT_FOUND','message','Registo não encontrado','data',null);
  END IF;

  v_state := public._punch_state(v_entry);

  -- Idempotência
  IF v_state IN ('stop','departure') THEN
    IF v_entry.ended_at > now() - interval '20 seconds' THEN
      RETURN jsonb_build_object('success',true,'code','PUNCH_STOPPED',
        'message','Já finalizado (idempotente)',
        'data', jsonb_build_object('time_entry_id',v_entry.id,'idempotent',true));
    END IF;
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Registo já finalizado.','data',null);
  END IF;

  IF v_state NOT IN ('start','pause','arrival') THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Transição inválida para stop.','data',jsonb_build_object('state',v_state));
  END IF;

  SELECT t.client_id INTO v_client FROM public.tasks t WHERE t.id = v_entry.task_id;
  v_pol := public._punch_resolve_policy(v_entry.company_id, v_client);
  v_eval := public._punch_evaluate_geo(
    v_lat, v_lng, v_acc, v_gps,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_pol->>'policy_stop')::geo_policy,
    (v_pol->>'no_loc_stop')::geo_policy,
    (v_pol->>'required_stop')::boolean,
    v_reason
  );

  IF v_eval->>'decision' = 'reject' THEN
    PERFORM public._punch_log_geopoint(
      v_entry.id, v_entry.company_id, v_uid, 'stop', v_cap,
      v_lat, v_lng, v_acc,
      (v_pol->>'client_lat')::double precision,(v_pol->>'client_lng')::double precision,
      (v_pol->>'radius_m')::int,
      (v_eval->>'status')::geo_status,(v_eval->>'reason_code')::geo_reason_code,
      v_reason,(v_pol->>'version')::int, v_dev, false
    );
    RETURN jsonb_build_object('success',false,
      'code', v_eval->>'reason_code',
      'message','Localização fora do raio permitido — política bloqueia término.',
      'data', jsonb_build_object('distance_m', v_eval->'distance_m'));
  END IF;
  IF v_eval->>'decision' = 'needs_reason' THEN
    PERFORM public._punch_log_geopoint(
      v_entry.id, v_entry.company_id, v_uid, 'stop', v_cap,
      v_lat, v_lng, v_acc,
      (v_pol->>'client_lat')::double precision,(v_pol->>'client_lng')::double precision,
      (v_pol->>'radius_m')::int,
      (v_eval->>'status')::geo_status,(v_eval->>'reason_code')::geo_reason_code,
      'JUSTIFICATION_REQUIRED',(v_pol->>'version')::int, v_dev, false
    );
    RETURN jsonb_build_object('success',false,'code','NEEDS_JUSTIFICATION',
      'message','Justificativa obrigatória para terminar fora do raio.','data',null);
  END IF;

  -- Minutos efetivos (grosseiro): ended-started - pausa acumulada aproximada
  v_minutes := GREATEST(0,
    EXTRACT(EPOCH FROM (now() - v_entry.started_at))::int / 60
    - COALESCE(
        CASE WHEN v_entry.paused_at IS NOT NULL AND v_entry.resumed_at IS NOT NULL
             AND v_entry.resumed_at > v_entry.paused_at
             THEN EXTRACT(EPOCH FROM (v_entry.resumed_at - v_entry.paused_at))::int/60
             ELSE 0 END, 0)
  );

  UPDATE public.time_entries
     SET ended_at = now(),
         effective_minutes = v_minutes,
         end_geo_status = (v_eval->>'status')::geo_status,
         end_geo_reason_code = (v_eval->>'reason_code')::geo_reason_code,
         end_geo_reason_text = v_reason,
         updated_at = now()
   WHERE id = v_entry.id;

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'stop', v_cap,
    v_lat, v_lng, v_acc,
    (v_pol->>'client_lat')::double precision,(v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_eval->>'status')::geo_status,(v_eval->>'reason_code')::geo_reason_code,
    v_reason,(v_pol->>'version')::int, v_dev, true
  );

  RETURN jsonb_build_object('success',true,'code','PUNCH_STOPPED',
    'message','Ponto finalizado.',
    'data', jsonb_build_object(
      'time_entry_id',v_entry.id,
      'effective_minutes',v_minutes,
      'geo_status', v_eval->>'status',
      'distance_m', v_eval->'distance_m'
    ));
END $$;

-- ============================================================
-- RPC: punch_pause_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_pause_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_state text;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_cap  timestamptz := NULLIF(p_input->>'captured_at','')::timestamptz;
  v_dev  jsonb := COALESCE(p_input->'device_fingerprint','{}'::jsonb);
  v_gps  text := COALESCE(p_input->>'gps_status','ok');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Sessão inválida','data',null);
  END IF;
  SELECT * INTO v_entry FROM public.time_entries WHERE id = v_entry_id AND user_id = v_uid;
  IF v_entry.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','ENTRY_NOT_FOUND','message','Registo não encontrado','data',null);
  END IF;
  v_state := public._punch_state(v_entry);

  IF v_state = 'pause' THEN
    IF v_entry.paused_at > now() - interval '20 seconds' THEN
      RETURN jsonb_build_object('success',true,'code','PUNCH_PAUSED',
        'message','Já pausado (idempotente)','data',jsonb_build_object('time_entry_id',v_entry.id,'idempotent',true));
    END IF;
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE','message','Já está em pausa.','data',null);
  END IF;
  IF v_state NOT IN ('start') THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Transição inválida para pause.','data',jsonb_build_object('state',v_state));
  END IF;

  UPDATE public.time_entries SET paused_at = now(), resumed_at = NULL, updated_at = now()
   WHERE id = v_entry.id;

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'pause', v_cap,
    v_lat, v_lng, v_acc, NULL, NULL, NULL,
    CASE WHEN v_gps='ok' AND v_lat IS NOT NULL THEN 'within'::geo_status ELSE 'no_location'::geo_status END,
    NULL, NULL, 1, v_dev, true
  );
  RETURN jsonb_build_object('success',true,'code','PUNCH_PAUSED','message','Ponto em pausa.',
    'data', jsonb_build_object('time_entry_id', v_entry.id));
END $$;

-- ============================================================
-- RPC: punch_resume_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_resume_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_state text;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_cap  timestamptz := NULLIF(p_input->>'captured_at','')::timestamptz;
  v_dev  jsonb := COALESCE(p_input->'device_fingerprint','{}'::jsonb);
  v_gps  text := COALESCE(p_input->>'gps_status','ok');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Sessão inválida','data',null);
  END IF;
  SELECT * INTO v_entry FROM public.time_entries WHERE id = v_entry_id AND user_id = v_uid;
  IF v_entry.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','ENTRY_NOT_FOUND','message','Registo não encontrado','data',null);
  END IF;
  v_state := public._punch_state(v_entry);

  IF v_state = 'start' THEN
    IF v_entry.resumed_at IS NOT NULL AND v_entry.resumed_at > now() - interval '20 seconds' THEN
      RETURN jsonb_build_object('success',true,'code','PUNCH_RESUMED',
        'message','Já retomado (idempotente)','data',jsonb_build_object('time_entry_id',v_entry.id,'idempotent',true));
    END IF;
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Não está pausado (resume sem pause).','data',null);
  END IF;
  IF v_state <> 'pause' THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Transição inválida para resume.','data',jsonb_build_object('state',v_state));
  END IF;

  UPDATE public.time_entries SET resumed_at = now(), updated_at = now() WHERE id = v_entry.id;

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'resume', v_cap,
    v_lat, v_lng, v_acc, NULL, NULL, NULL,
    CASE WHEN v_gps='ok' AND v_lat IS NOT NULL THEN 'within'::geo_status ELSE 'no_location'::geo_status END,
    NULL, NULL, 1, v_dev, true
  );
  RETURN jsonb_build_object('success',true,'code','PUNCH_RESUMED','message','Ponto retomado.',
    'data', jsonb_build_object('time_entry_id', v_entry.id));
END $$;

-- ============================================================
-- RPC: punch_arrival_v2 (opcional; requer entry ativo)
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_arrival_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_state text;
  v_last punch_event_kind;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_cap  timestamptz := NULLIF(p_input->>'captured_at','')::timestamptz;
  v_dev  jsonb := COALESCE(p_input->'device_fingerprint','{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Sessão inválida','data',null);
  END IF;
  SELECT * INTO v_entry FROM public.time_entries WHERE id = v_entry_id AND user_id = v_uid;
  IF v_entry.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','ENTRY_NOT_FOUND','message','Registo não encontrado','data',null);
  END IF;
  v_state := public._punch_state(v_entry);
  v_last := public._punch_last_accepted_event(v_entry.id);

  IF v_last = 'arrival' THEN
    RETURN jsonb_build_object('success',true,'code','PUNCH_ARRIVED',
      'message','Chegada já registrada (idempotente)','data',jsonb_build_object('idempotent',true));
  END IF;
  IF v_state NOT IN ('start','arrival') THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Chegada só permitida antes/durante start.','data',jsonb_build_object('state',v_state));
  END IF;

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'arrival', v_cap,
    v_lat, v_lng, v_acc, NULL, NULL, NULL,
    CASE WHEN v_lat IS NOT NULL THEN 'within'::geo_status ELSE 'no_location'::geo_status END,
    NULL, NULL, 1, v_dev, true
  );
  RETURN jsonb_build_object('success',true,'code','PUNCH_ARRIVED','message','Chegada registrada.',
    'data', jsonb_build_object('time_entry_id', v_entry.id));
END $$;

-- ============================================================
-- RPC: punch_departure_v2 (opcional; requer stop)
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_departure_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_state text;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_cap  timestamptz := NULLIF(p_input->>'captured_at','')::timestamptz;
  v_dev  jsonb := COALESCE(p_input->'device_fingerprint','{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Sessão inválida','data',null);
  END IF;
  SELECT * INTO v_entry FROM public.time_entries WHERE id = v_entry_id AND user_id = v_uid;
  IF v_entry.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','ENTRY_NOT_FOUND','message','Registo não encontrado','data',null);
  END IF;
  v_state := public._punch_state(v_entry);

  IF v_state = 'departure' THEN
    RETURN jsonb_build_object('success',true,'code','PUNCH_DEPARTED',
      'message','Saída já registrada (idempotente)','data',jsonb_build_object('idempotent',true));
  END IF;
  IF v_state <> 'stop' THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Saída só permitida após stop.','data',jsonb_build_object('state',v_state));
  END IF;

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'departure', v_cap,
    v_lat, v_lng, v_acc, NULL, NULL, NULL,
    CASE WHEN v_lat IS NOT NULL THEN 'within'::geo_status ELSE 'no_location'::geo_status END,
    NULL, NULL, 1, v_dev, true
  );
  RETURN jsonb_build_object('success',true,'code','PUNCH_DEPARTED','message','Saída registrada.',
    'data', jsonb_build_object('time_entry_id', v_entry.id));
END $$;

-- ============================================================
-- GRANTs
-- ============================================================
REVOKE ALL ON FUNCTION public.punch_start_v2(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.punch_stop_v2(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.punch_pause_v2(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.punch_resume_v2(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.punch_arrival_v2(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.punch_departure_v2(jsonb) FROM public;

GRANT EXECUTE ON FUNCTION public.punch_start_v2(jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.punch_stop_v2(jsonb)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.punch_pause_v2(jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.punch_resume_v2(jsonb)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.punch_arrival_v2(jsonb)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.punch_departure_v2(jsonb) TO authenticated;
