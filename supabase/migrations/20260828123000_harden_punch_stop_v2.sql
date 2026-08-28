-- Mantém o fluxo de stop idempotente e evita falhas técnicas quando a
-- avaliação de geolocalização não retornar todos os campos derivados.
-- Não altera RLS, permissões, regras de geofence ou dados existentes.
CREATE OR REPLACE FUNCTION public.punch_stop_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid := (p_input->>'time_entry_id')::uuid;
  v_entry public.time_entries;
  v_client uuid;
  v_pol jsonb;
  v_eval jsonb;
  v_lat double precision := NULLIF(p_input->>'lat','')::double precision;
  v_lng double precision := NULLIF(p_input->>'lng','')::double precision;
  v_acc double precision := NULLIF(p_input->>'accuracy_m','')::double precision;
  v_gps text := COALESCE(p_input->>'gps_status','ok');
  v_cap timestamptz := NULLIF(p_input->>'captured_at','')::timestamptz;
  v_dev jsonb := COALESCE(p_input->'device_fingerprint','{}'::jsonb);
  v_reason text := NULLIF(p_input->>'reason_text','');
  v_state text;
  v_minutes int;
  v_geo_status geo_status;
  v_reason_code geo_reason_code;
  v_policy_version int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Sessão inválida','data',null);
  END IF;

  SELECT * INTO v_entry
    FROM public.time_entries
   WHERE id = v_entry_id AND user_id = v_uid;
  IF v_entry.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','ENTRY_NOT_FOUND','message','Registo não encontrado','data',null);
  END IF;

  v_state := public._punch_state(v_entry);

  IF v_state IN ('stop','departure') THEN
    IF v_entry.ended_at > now() - interval '20 seconds' THEN
      RETURN jsonb_build_object('success',true,'code','PUNCH_STOPPED',
        'message','Já finalizado (idempotente)',
        'data',jsonb_build_object('time_entry_id',v_entry.id,'idempotent',true));
    END IF;
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Registo já finalizado.','data',null);
  END IF;

  IF v_state NOT IN ('start','pause','arrival') THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE',
      'message','Transição inválida para stop.','data',jsonb_build_object('state',v_state));
  END IF;

  SELECT t.client_id INTO v_client
    FROM public.tasks t
   WHERE t.id = v_entry.task_id;
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

  -- Os campos abaixo alimentam colunas NOT NULL no histórico de geofence.
  -- A normalização também protege instalações com função auxiliar antiga.
  v_geo_status := COALESCE((v_eval->>'status')::geo_status, 'no_location'::geo_status);
  v_reason_code := COALESCE((v_eval->>'reason_code')::geo_reason_code, 'NO_GPS'::geo_reason_code);
  v_policy_version := COALESCE((v_pol->>'version')::int, 1);

  IF v_eval->>'decision' = 'reject' THEN
    PERFORM public._punch_log_geopoint(
      v_entry.id, v_entry.company_id, v_uid, 'stop', v_cap,
      v_lat, v_lng, v_acc,
      (v_pol->>'client_lat')::double precision,(v_pol->>'client_lng')::double precision,
      (v_pol->>'radius_m')::int,
      v_geo_status, v_reason_code, v_reason, v_policy_version, v_dev, false
    );
    RETURN jsonb_build_object('success',false,
      'code', v_eval->>'reason_code',
      'message','Localização fora do raio permitido — política bloqueia término.',
      'data',jsonb_build_object('distance_m',v_eval->'distance_m'));
  END IF;

  IF v_eval->>'decision' = 'needs_reason' THEN
    PERFORM public._punch_log_geopoint(
      v_entry.id, v_entry.company_id, v_uid, 'stop', v_cap,
      v_lat, v_lng, v_acc,
      (v_pol->>'client_lat')::double precision,(v_pol->>'client_lng')::double precision,
      (v_pol->>'radius_m')::int,
      v_geo_status, v_reason_code, 'JUSTIFICATION_REQUIRED', v_policy_version, v_dev, false
    );
    RETURN jsonb_build_object('success',false,'code','NEEDS_JUSTIFICATION',
      'message','Justificativa obrigatória para terminar fora do raio.','data',null);
  END IF;

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
         end_geo_status = v_geo_status,
         end_geo_reason_code = v_reason_code,
         end_geo_reason_text = v_reason,
         updated_at = now()
   WHERE id = v_entry.id;

  PERFORM public._punch_log_geopoint(
    v_entry.id, v_entry.company_id, v_uid, 'stop', v_cap,
    v_lat, v_lng, v_acc,
    (v_pol->>'client_lat')::double precision,(v_pol->>'client_lng')::double precision,
    (v_pol->>'radius_m')::int,
    v_geo_status, v_reason_code, v_reason, v_policy_version, v_dev, true
  );

  RETURN jsonb_build_object('success',true,'code','PUNCH_STOPPED',
    'message','Ponto finalizado.',
    'data',jsonb_build_object(
      'time_entry_id',v_entry.id,
      'effective_minutes',v_minutes,
      'geo_status',v_geo_status,
      'distance_m',v_eval->'distance_m'
    ));
END $$;

