-- ADR-059 (rev. 2) · Assinatura documental das Folhas de Ponto validadas.
-- Aditivo. Nada aqui toca horas, entradas, saídas, pausas, totais,
-- remuneração, estado, datas de validação, employee_id ou company_id.

-- 1) Fonte canónica da assinatura da VERSÃO (snapshot é imutável).
ALTER TABLE public.timesheet_period_versions
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS initials_url text,
  ADD COLUMN IF NOT EXISTS signature_source text,
  ADD COLUMN IF NOT EXISTS signature_linked_at timestamptz;

-- 2) Append-only: assinatura, uma vez associada, nunca muda.
CREATE OR REPLACE FUNCTION public.timesheet_versions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TIMESHEET_VERSION_IMMUTABLE';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.period_id IS DISTINCT FROM OLD.period_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
     OR (OLD.pdf_path IS NOT NULL AND NEW.pdf_path IS DISTINCT FROM OLD.pdf_path)
     OR (OLD.signature_url IS NOT NULL AND NEW.signature_url IS DISTINCT FROM OLD.signature_url) THEN
    RAISE EXCEPTION 'TIMESHEET_VERSION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $function$;

-- 3) Futuras validações: assinatura snapshotada na versão automaticamente.
CREATE OR REPLACE FUNCTION public.timesheet_sign(_period_id uuid)
 RETURNS timesheet_period_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.timesheet_periods;
  v_snap jsonb;
  v_ver public.timesheet_period_versions;
  v_name text;
  v_sig text;
  v_init text;
  v_mgr record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_p FROM public.timesheet_periods WHERE id = _period_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND'; END IF;
  IF v_p.employee_id <> v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_p.status IN ('fechado_gestor', 'disponivel_contabilidade') THEN
    RAISE EXCEPTION 'PERIOD_CLOSED';
  END IF;

  v_snap := public.timesheet_build_snapshot(v_p.company_id, v_p.employee_id, v_p.period_year, v_p.period_month);

  SELECT pr.signature_url, pr.initials_url INTO v_sig, v_init
  FROM public.profiles pr WHERE pr.id = v_p.employee_id;

  INSERT INTO public.timesheet_period_versions
    (period_id, company_id, employee_id, version, snapshot, signed_at, created_by,
     signature_url, initials_url, signature_source, signature_linked_at)
  VALUES (v_p.id, v_p.company_id, v_p.employee_id, v_p.current_version + 1, v_snap, now(), v_uid,
          v_sig, v_init, CASE WHEN v_sig IS NULL THEN NULL ELSE 'employee_signature_at_sign' END,
          CASE WHEN v_sig IS NULL THEN NULL ELSE now() END)
  RETURNING * INTO v_ver;

  UPDATE public.timesheet_periods SET
    status = 'assinado_funcionario',
    current_version = v_ver.version,
    signed_at = now(),
    signed_by = v_uid,
    correction_requested_at = NULL,
    correction_reason = NULL,
    worked_minutes = (v_snap->'summary'->>'worked_minutes')::int,
    paid_days = (v_snap->'summary'->>'paid_days')::int,
    payment_type_used = v_snap->'summary'->>'payment_type_used',
    rate_used = NULLIF(v_snap->'summary'->>'rate_used','')::numeric,
    rate_source = v_snap->'summary'->>'rate_source',
    monthly_amount = NULLIF(v_snap->'summary'->>'monthly_amount','')::numeric,
    calculated_amount = NULLIF(v_snap->'summary'->>'calculated_amount','')::numeric,
    currency = COALESCE(v_snap->'summary'->>'currency', currency)
  WHERE id = v_p.id;

  INSERT INTO public.timesheet_audit_events (company_id, period_id, employee_id, actor_user_id, event, version)
  VALUES (v_p.company_id, v_p.id, v_p.employee_id, v_uid,
          CASE WHEN v_ver.version > 1 THEN 'REPORT_REGENERATED' ELSE 'REPORT_GENERATED' END, v_ver.version),
         (v_p.company_id, v_p.id, v_p.employee_id, v_uid, 'EMPLOYEE_SIGNED', v_ver.version);

  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  FOR v_mgr IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    WHERE ur.company_id = v_p.company_id AND ur.role IN ('manager','owner')
  LOOP
    PERFORM public._notify(
      v_p.company_id, v_mgr.user_id, NULL, 'timesheet_employee_signed',
      'Folha de ponto assinada',
      COALESCE(v_name, 'Funcionário') || ' assinou a Folha de Ponto de ' ||
        lpad(v_p.period_month::text, 2, '0') || '/' || v_p.period_year::text || '.',
      'media',
      jsonb_build_object('period_id', v_p.id, 'version', v_ver.version)
    );
  END LOOP;

  RETURN v_ver;
END $function$;

-- 4) Auditoria: elegibilidade passa a considerar a coluna canónica.
CREATE OR REPLACE FUNCTION public.timesheet_signature_audit(_company_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(period_id uuid, company_id uuid, employee_id uuid, employee_name text, period_year integer, period_month integer, status timesheet_status, version integer, version_id uuid, validated_at timestamp with time zone, validated_by uuid, snapshot_signature_url text, profile_signature_url text, signature_created_at timestamp with time zone, classification text)
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
    COALESCE(v.signature_url, NULLIF(v.snapshot->'employee'->>'signature_url','')),
    pr.signature_url,
    so.created_at,
    CASE
      WHEN COALESCE(v.signature_url, NULLIF(v.snapshot->'employee'->>'signature_url','')) IS NOT NULL
        THEN 'A_SIGNATURE_PRESENT'
      WHEN p.signed_by IS DISTINCT FROM p.employee_id THEN 'D_INCONSISTENT'
      WHEN pr.signature_url IS NULL THEN 'C_MANUAL_REVIEW'
      ELSE 'B_SAFE_BACKFILL'
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

-- 5) Backfill idempotente: só versões validadas pelo próprio funcionário.
DO $backfill$
DECLARE
  v_row record;
  v_updated int := 0;
BEGIN
  FOR v_row IN
    SELECT v.id AS version_id, v.period_id, v.company_id, v.employee_id, v.version,
           pr.signature_url, pr.initials_url, p.signed_by, v.signed_at,
           so.created_at AS signature_created_at
    FROM public.timesheet_periods p
    JOIN public.timesheet_period_versions v
      ON v.period_id = p.id AND v.version = p.current_version
    JOIN public.profiles pr ON pr.id = p.employee_id
    LEFT JOIN storage.objects so
      ON so.bucket_id = 'employee-signatures' AND so.name = pr.signature_url
    WHERE p.signed_at IS NOT NULL
      AND v.signed_at IS NOT NULL
      AND p.signed_by = p.employee_id
      AND pr.signature_url IS NOT NULL
      AND v.signature_url IS NULL
  LOOP
    UPDATE public.timesheet_period_versions v
    SET signature_url = v_row.signature_url,
        initials_url = COALESCE(v.initials_url, v_row.initials_url),
        signature_source = COALESCE(v.signature_source, 'backfill_validated_by_employee'),
        signature_linked_at = COALESCE(v.signature_linked_at, now())
    WHERE v.id = v_row.version_id
      AND v.signature_url IS NULL;

    IF FOUND THEN
      v_updated := v_updated + 1;
      INSERT INTO public.timesheet_audit_events
        (company_id, period_id, employee_id, actor_user_id, event, version, metadata)
      VALUES (
        v_row.company_id, v_row.period_id, v_row.employee_id, v_row.signed_by,
        'SIGNATURE_BACKFILLED', v_row.version,
        jsonb_build_object(
          'signature_url', v_row.signature_url,
          'signature_created_at', v_row.signature_created_at,
          'validated_at', v_row.signed_at,
          'late_signature', (v_row.signature_created_at IS NULL OR v_row.signature_created_at > v_row.signed_at),
          'source', 'migration_adr059_rev2'
        )
      );
    END IF;
  END LOOP;
  RAISE NOTICE 'timesheet signature backfill: % versões corrigidas', v_updated;
END $backfill$;

-- 6) Backfill programável (Super Admin), idempotente, dry-run por omissão.
CREATE OR REPLACE FUNCTION public.timesheet_signature_backfill(_dry_run boolean DEFAULT true, _company_id uuid DEFAULT NULL::uuid)
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
             a.profile_signature_url, a.signature_created_at, a.validated_at, pr.initials_url
      FROM public.timesheet_signature_audit(_company_id) a
      JOIN public.profiles pr ON pr.id = a.employee_id
      WHERE a.classification = 'B_SAFE_BACKFILL'
    LOOP
      UPDATE public.timesheet_period_versions v
      SET signature_url = v_row.profile_signature_url,
          initials_url = COALESCE(v.initials_url, v_row.initials_url),
          signature_source = COALESCE(v.signature_source, 'backfill_validated_by_employee'),
          signature_linked_at = COALESCE(v.signature_linked_at, now())
      WHERE v.id = v_row.version_id
        AND v.signature_url IS NULL;

      IF FOUND THEN
        v_updated := v_updated + 1;
        INSERT INTO public.timesheet_audit_events
          (company_id, period_id, employee_id, actor_user_id, event, version, metadata)
        VALUES (
          v_row.company_id, v_row.period_id, v_row.employee_id, v_uid,
          'SIGNATURE_BACKFILLED', v_row.version,
          jsonb_build_object(
            'signature_url', v_row.profile_signature_url,
            'signature_created_at', v_row.signature_created_at,
            'validated_at', v_row.validated_at,
            'late_signature', (v_row.signature_created_at IS NULL OR v_row.signature_created_at > v_row.validated_at),
            'source', 'timesheet_signature_backfill'
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', _dry_run,
    'eligible', v_eligible,
    'updated', v_updated,
    'already_signed', v_already,
    'manual_review', v_manual,
    'inconsistent', v_inconsistent
  );
END $function$;

REVOKE ALL ON FUNCTION public.timesheet_signature_backfill(boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_signature_backfill(boolean, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.timesheet_signature_audit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_signature_audit(uuid) TO authenticated, service_role;