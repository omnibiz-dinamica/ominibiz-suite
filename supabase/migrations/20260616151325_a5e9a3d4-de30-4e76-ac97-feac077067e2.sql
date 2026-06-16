
CREATE OR REPLACE FUNCTION public.vacation_notify_payload(_vacation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO 'public' AS $$
DECLARE
  v_req public.vacation_requests%ROWTYPE;
  v_uid uuid := auth.uid();
  v_emp_email text; v_emp_name text;
  v_app_email text; v_app_name text;
  v_dec_email text; v_dec_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_req FROM public.vacation_requests WHERE id = _vacation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não encontrada'; END IF;

  IF NOT (public.is_company_member(v_uid, v_req.company_id)
          OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT email INTO v_emp_email FROM auth.users WHERE id = v_req.user_id;
  SELECT full_name INTO v_emp_name FROM public.profiles WHERE id = v_req.user_id;

  IF v_req.assigned_approver_id IS NOT NULL THEN
    SELECT email INTO v_app_email FROM auth.users WHERE id = v_req.assigned_approver_id;
    SELECT full_name INTO v_app_name FROM public.profiles WHERE id = v_req.assigned_approver_id;
  END IF;
  IF v_req.decided_by IS NOT NULL THEN
    SELECT email INTO v_dec_email FROM auth.users WHERE id = v_req.decided_by;
    SELECT full_name INTO v_dec_name FROM public.profiles WHERE id = v_req.decided_by;
  END IF;

  RETURN jsonb_build_object(
    'id', v_req.id,
    'company_id', v_req.company_id,
    'status', v_req.status,
    'start_date', v_req.start_date,
    'end_date', v_req.end_date,
    'decision_reason', v_req.decision_reason,
    'employee', jsonb_build_object('id', v_req.user_id, 'email', v_emp_email, 'name', v_emp_name),
    'approver', jsonb_build_object('id', v_req.assigned_approver_id, 'email', v_app_email, 'name', v_app_name),
    'decided_by', jsonb_build_object('id', v_req.decided_by, 'email', v_dec_email, 'name', v_dec_name)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vacation_notify_payload(uuid) TO authenticated;
