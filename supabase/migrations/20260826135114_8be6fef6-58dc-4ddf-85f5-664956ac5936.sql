-- ADR-042: consistência da avaliação de geolocalização em todos os eventos de ponto.
-- Chegada/Pausa/Retomada/Partida deixam de gravar 'within' fixo e passam a usar
-- _punch_resolve_policy + _punch_evaluate_geo (informativo, nunca bloqueante).

CREATE OR REPLACE FUNCTION public.punch_arrival_v2(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_state text;
  v_last punch_event_kind;
  v_client uuid;
  v_pol jsonb;
  v_eval jsonb;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_gps  text := COALESCE(p_input->>'gps_status','ok');
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

  SELECT t.client_id INTO v_client FROM public.tasks t WHERE t.id = v_entry.task_id;
  v_pol := public._punch_resolve_policy(v_entry.company_id, v_client);
  v_eval := public._punch_evaluate_geo(
    v_lat, v_lng, v_acc, v_gps,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    'alert'::geo_policy, 'alert'::geo_policy, false, NULL
  );

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'arrival', v_cap,
    v_lat, v_lng, v_acc,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_eval->>'status')::geo_status,
    (v_eval->>'reason_code')::geo_reason_code,
    NULL, COALESCE((v_pol->>'version')::int, 1), v_dev, true
  );
  RETURN jsonb_build_object('success',true,'code','PUNCH_ARRIVED','message','Chegada registrada.',
    'data', jsonb_build_object('time_entry_id', v_entry.id,
      'geo_status', v_eval->>'status', 'reason_code', v_eval->>'reason_code',
      'distance_m', v_eval->'distance_m'));
END $function$;

CREATE OR REPLACE FUNCTION public.punch_pause_v2(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_state text;
  v_client uuid;
  v_pol jsonb;
  v_eval jsonb;
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

  SELECT t.client_id INTO v_client FROM public.tasks t WHERE t.id = v_entry.task_id;
  v_pol := public._punch_resolve_policy(v_entry.company_id, v_client);
  v_eval := public._punch_evaluate_geo(
    v_lat, v_lng, v_acc, v_gps,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    'alert'::geo_policy, 'alert'::geo_policy, false, NULL
  );

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'pause', v_cap,
    v_lat, v_lng, v_acc,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_eval->>'status')::geo_status,
    (v_eval->>'reason_code')::geo_reason_code,
    NULL, COALESCE((v_pol->>'version')::int, 1), v_dev, true
  );
  RETURN jsonb_build_object('success',true,'code','PUNCH_PAUSED','message','Ponto em pausa.',
    'data', jsonb_build_object('time_entry_id', v_entry.id));
END $function$;

CREATE OR REPLACE FUNCTION public.punch_resume_v2(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_state text;
  v_client uuid;
  v_pol jsonb;
  v_eval jsonb;
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

  SELECT t.client_id INTO v_client FROM public.tasks t WHERE t.id = v_entry.task_id;
  v_pol := public._punch_resolve_policy(v_entry.company_id, v_client);
  v_eval := public._punch_evaluate_geo(
    v_lat, v_lng, v_acc, v_gps,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    'alert'::geo_policy, 'alert'::geo_policy, false, NULL
  );

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'resume', v_cap,
    v_lat, v_lng, v_acc,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_eval->>'status')::geo_status,
    (v_eval->>'reason_code')::geo_reason_code,
    NULL, COALESCE((v_pol->>'version')::int, 1), v_dev, true
  );
  RETURN jsonb_build_object('success',true,'code','PUNCH_RESUMED','message','Ponto retomado.',
    'data', jsonb_build_object('time_entry_id', v_entry.id));
END $function$;

CREATE OR REPLACE FUNCTION public.punch_departure_v2(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_state text;
  v_client uuid;
  v_pol jsonb;
  v_eval jsonb;
  v_lat  double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng  double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc  double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_gps  text := COALESCE(p_input->>'gps_status','ok');
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

  SELECT t.client_id INTO v_client FROM public.tasks t WHERE t.id = v_entry.task_id;
  v_pol := public._punch_resolve_policy(v_entry.company_id, v_client);
  v_eval := public._punch_evaluate_geo(
    v_lat, v_lng, v_acc, v_gps,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    'alert'::geo_policy, 'alert'::geo_policy, false, NULL
  );

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'departure', v_cap,
    v_lat, v_lng, v_acc,
    (v_pol->>'client_lat')::double precision,
    (v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    (v_eval->>'status')::geo_status,
    (v_eval->>'reason_code')::geo_reason_code,
    NULL, COALESCE((v_pol->>'version')::int, 1), v_dev, true
  );
  RETURN jsonb_build_object('success',true,'code','PUNCH_DEPARTED','message','Saída registrada.',
    'data', jsonb_build_object('time_entry_id', v_entry.id,
      'geo_status', v_eval->>'status', 'reason_code', v_eval->>'reason_code',
      'distance_m', v_eval->'distance_m'));
END $function$;