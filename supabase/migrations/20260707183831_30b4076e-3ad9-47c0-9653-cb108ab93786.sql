
DO $$
DECLARE
  v_user uuid;
  v_company uuid := 'eec32f9a-32ad-4af8-9c10-25eb9cd26099';
  v_roles int; v_invites int; v_profile int;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE lower(email)='letrasmodestas@hotmail.com' LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'usuário não encontrado';
    RETURN;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user AND company_id = v_company;
  GET DIAGNOSTICS v_roles = ROW_COUNT;

  UPDATE public.invites SET status='revoked'
   WHERE lower(email)='letrasmodestas@hotmail.com'
     AND company_id = v_company
     AND status IN ('pending','accepted');
  GET DIAGNOSTICS v_invites = ROW_COUNT;

  UPDATE public.profiles
     SET current_company_id = NULL,
         company_id_primary = CASE WHEN company_id_primary = v_company THEN NULL ELSE company_id_primary END
   WHERE id = v_user AND (current_company_id = v_company OR company_id_primary = v_company);
  GET DIAGNOSTICS v_profile = ROW_COUNT;

  RAISE NOTICE 'user=% roles_removed=% invites_revoked=% profile_rows=%', v_user, v_roles, v_invites, v_profile;
END $$;
