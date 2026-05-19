CREATE OR REPLACE FUNCTION public.get_auth_context()
RETURNS TABLE(current_company_id uuid, roles jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_company_id uuid;
  v_is_super boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_uid, COALESCE(v_email, 'Usuário'))
  ON CONFLICT (id) DO NOTHING;

  IF v_email = 'edurts.pt@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (v_uid, 'super_admin', NULL)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'super_admin'
  ) INTO v_is_super;

  SELECT p.current_company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_company_id IS NULL THEN
    SELECT ur.company_id INTO v_company_id
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.company_id IS NOT NULL
    ORDER BY ur.created_at DESC
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL AND v_is_super THEN
    SELECT c.id INTO v_company_id
    FROM public.companies c
    ORDER BY c.created_at DESC
    LIMIT 1;

    IF v_company_id IS NULL THEN
      INSERT INTO public.companies (name, slug, country, currency, language, timezone, status, created_by)
      VALUES (
        'Minha Empresa',
        'empresa-' || left(replace(v_uid::text, '-', ''), 8) || '-' || lower(substr(md5(clock_timestamp()::text), 1, 8)),
        'PT',
        'EUR',
        'pt-PT',
        'Europe/Lisbon',
        'active',
        v_uid
      )
      RETURNING id INTO v_company_id;
    END IF;
  END IF;

  IF v_company_id IS NOT NULL THEN
    UPDATE public.profiles
    SET current_company_id = v_company_id
    WHERE id = v_uid;
  END IF;

  RETURN QUERY
  SELECT
    v_company_id,
    COALESCE(
      jsonb_agg(
        jsonb_build_object('role', ur.role, 'company_id', ur.company_id)
        ORDER BY ur.created_at
      ) FILTER (WHERE ur.id IS NOT NULL),
      '[]'::jsonb
    ) AS roles
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid;
END
$function$;

CREATE OR REPLACE FUNCTION public.set_current_company(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF _company_id IS NOT NULL
     AND NOT public.is_super_admin(v_uid)
     AND NOT public.is_company_member(v_uid, _company_id) THEN
    RAISE EXCEPTION 'Sem permissão para operar esta empresa';
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_uid, COALESCE(lower(auth.jwt() ->> 'email'), 'Usuário'))
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET current_company_id = _company_id
  WHERE id = v_uid;

  RETURN _company_id;
END
$function$;