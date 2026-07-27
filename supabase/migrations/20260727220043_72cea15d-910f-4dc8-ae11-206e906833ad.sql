CREATE OR REPLACE FUNCTION public._punch_log_geopoint(p_entry_id uuid, p_company_id uuid, p_user_id uuid, p_event_kind punch_event_kind, p_captured_at timestamp with time zone, p_lat double precision, p_lng double precision, p_accuracy_m double precision, p_client_lat double precision, p_client_lng double precision, p_client_radius integer, p_geo_status geo_status, p_reason_code geo_reason_code, p_reason_text text, p_policy_version integer, p_device jsonb, p_accepted boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_dist double precision;
  v_geo_status geo_status := COALESCE(p_geo_status, 'no_location'::geo_status);
  v_reason_code geo_reason_code;
  v_text text;
  v_policy_version integer := COALESCE(p_policy_version, 1);
BEGIN
  v_dist := CASE
    WHEN p_lat IS NULL OR p_lng IS NULL OR p_client_lat IS NULL OR p_client_lng IS NULL
      THEN NULL
    ELSE public.haversine_m(p_lat, p_lng, p_client_lat, p_client_lng)
  END;

  v_reason_code := COALESCE(
    p_reason_code,
    CASE
      WHEN v_geo_status = 'within' THEN 'WITHIN_RADIUS'::geo_reason_code
      WHEN v_geo_status = 'out_of_range' THEN 'OUT_OF_RADIUS'::geo_reason_code
      WHEN v_geo_status = 'no_location' THEN 'NO_GPS'::geo_reason_code
      ELSE 'NO_GPS'::geo_reason_code
    END
  );

  v_text := CASE
    WHEN p_accepted THEN p_reason_text
    ELSE '__REJECTED__:' || v_reason_code::text ||
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
    v_geo_status, v_reason_code, v_text,
    'gps'::location_source, v_policy_version, COALESCE(p_device, '{}'::jsonb),
    false
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $function$;