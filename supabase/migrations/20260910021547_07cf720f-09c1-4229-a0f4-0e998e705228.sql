-- ADR-059 · Backfill documental de assinaturas em folhas de ponto validadas.
-- Nada aqui altera time_entries, tarefas, férias, totais, status ou timestamps históricos.

CREATE OR REPLACE FUNCTION public.timesheet_signature_audit(_company_id uuid DEFAULT NULL)
RETURNS TABLE(
  period_id uuid,
  company_id uuid,
  employee_id uuid,
  employee_name text,
  period_year integer,
  period_month integer,
  status timesheet_status,
  version integer,
  version_id uuid,
  validated_at timestamp with time zone,
  validated_by uuid,
  snapshot_signature_url text,
  profile_signature_url text,
  signature_created_at timestamp with time zone,
  classification text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _company_id IS NOT NULL THEN
    IF NOT (public.is_company_manager(v_uid, _company_id)
            OR public.is_company_owner(v_uid, _company_id)
            OR public.is_super_admin(v_uid)) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  ELSIF NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.company_id,
    p.employee_id,
    pr.full_name,
    p.period_year,
    p.period_month,
    p.status,
    v.version,
    v.id,
    v.signed_at,
    p.signed_by,
    v.snapshot->'employee'->>'signature_url',
    pr.signature_url,
    so.created_at,
    CASE
      WHEN NULLIF(v.snapshot->'employee'->>'signature_url','') IS NOT NULL THEN 'A_SIGNATURE_PRESENT'
      WHEN p.signed_by IS DISTINCT FROM p.employee_id THEN 'D_INCONSISTENT'
      WHEN pr.signature_url IS NULL THEN 'C_MANUAL_REVIEW'
      WHEN so.created_at IS NULL THEN 'C_MANUAL_REVIEW'
      WHEN so.created_at <= v.signed_at THEN 'B_SAFE_BACKFILL'
      ELSE 'C_MANUAL_REVIEW'
    END
  FROM public.timesheet_periods p
  JOIN public.timesheet_period_versions v
    ON v.period_id = p.id AND v.version = p.current_version
  JOIN public.profiles pr ON pr.id = p.employee_id
  LEFT JOIN storage.objects so
    ON so.bucket_id = 'employee-signatures' AND so.name = pr.signature_url
  WHERE p.signed_at IS NOT NULL
    AND v.signed_at IS NOT NULL
    AND (_company_id IS NULL OR p.company_id = _company_id)
  ORDER BY p.period_year DESC, p.period_month DESC, pr.full_name NULLS LAST;
END $function$;

REVOKE ALL ON FUNCTION public.timesheet_signature_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.timesheet_signature_audit(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.timesheet_signature_backfill(_dry_run boolean DEFAULT true, _company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_eligible int := 0;
  v_updated int := 0;
  v_already int := 0;
  v_manual int := 0;
  v_inconsistent int := 0;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_super_admin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT
    COUNT(*) FILTER (WHERE a.classification = 'B_SAFE_BACKFILL'),
    COUNT(*) FILTER (WHERE a.classification = 'A_SIGNATURE_PRESENT'),
    COUNT(*) FILTER (WHERE a.classification = 'C_MANUAL_REVIEW'),
    COUNT(*) FILTER (WHERE a.classification = 'D_INCONSISTENT')
    INTO v_eligible, v_already, v_manual, v_inconsistent
  FROM public.timesheet_signature_audit(_company_id) a;

  IF NOT _dry_run THEN
    FOR v_row IN
      SELECT a.version_id, a.period_id, a.company_id, a.employee_id, a.version,
             a.profile_signature_url, pr.initials_url
      FROM public.timesheet_signature_audit(_company_id) a
      JOIN public.profiles pr ON pr.id = a.employee_id
      WHERE a.classification = 'B_SAFE_BACKFILL'
    LOOP
      -- Só a chave employee.signature_url/initials_url é tocada; o resto do
      -- snapshot (horas, dias, totais, remuneração) permanece byte-a-byte igual.
      UPDATE public.timesheet_period_versions v
      SET snapshot = jsonb_set(
            jsonb_set(v.snapshot, '{employee,signature_url}', to_jsonb(v_row.profile_signature_url), true),
            '{employee,initials_url}',
            CASE WHEN v_row.initials_url IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_row.initials_url) END,
            true
          )
      WHERE v.id = v_row.version_id
        AND NULLIF(v.snapshot->'employee'->>'signature_url','') IS NULL;

      IF FOUND THEN
        v_updated := v_updated + 1;
        INSERT INTO public.timesheet_audit_events
          (company_id, period_id, employee_id, actor_user_id, event, version, metadata)
        VALUES (v_row.company_id, v_row.period_id, v_row.employee_id, v_uid,
                'SIGNATURE_BACKFILLED', v_row.version,
                jsonb_build_object(
                  'reason', 'historical_render_association_failure',
                  'signature_url', v_row.profile_signature_url,
                  'backfilled_at', now()
                ));
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', _dry_run,
    'already_signed', v_already,
    'safe_backfill', v_eligible,
    'manual_review', v_manual,
    'inconsistent', v_inconsistent,
    'updated', v_updated
  );
END $function$;

REVOKE ALL ON FUNCTION public.timesheet_signature_backfill(boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.timesheet_signature_backfill(boolean, uuid) TO authenticated, service_role;