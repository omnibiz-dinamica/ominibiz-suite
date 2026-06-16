
DROP FUNCTION IF EXISTS public.resend_invite(uuid);

CREATE OR REPLACE FUNCTION public.invite_email_audit(_email text, _company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_user_id uuid;
  v_profile jsonb;
  v_invites jsonb;
  v_has_membership boolean := false;
BEGIN
  IF NOT (public.is_company_manager(auth.uid(), _company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT to_jsonb(p) INTO v_profile FROM public.profiles p WHERE p.id = v_user_id;
    SELECT EXISTS(
      SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND company_id = _company_id
    ) INTO v_has_membership;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC), '[]'::jsonb)
    INTO v_invites
  FROM public.invites i
  WHERE lower(i.email) = v_email AND i.company_id = _company_id;

  RETURN jsonb_build_object(
    'email', v_email,
    'company_id', _company_id,
    'user_id', v_user_id,
    'user_exists', v_user_id IS NOT NULL,
    'profile', v_profile,
    'has_membership', v_has_membership,
    'invites', v_invites
  );
END $$;

GRANT EXECUTE ON FUNCTION public.invite_email_audit(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resend_invite(_invite_id uuid)
RETURNS TABLE(
  id uuid, email text, token text, role app_role,
  expires_at timestamp with time zone, company_id uuid,
  send_count integer, last_sent_at timestamp with time zone,
  was_expired boolean, was_revoked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv public.invites%ROWTYPE;
  v_was_expired boolean := false;
  v_was_revoked boolean := false;
  v_new_token text;
BEGIN
  SELECT * INTO inv FROM public.invites WHERE invites.id = _invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite não encontrado'; END IF;

  IF NOT (public.is_company_manager(auth.uid(), inv.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden: sem permissão para reenviar este convite';
  END IF;

  IF inv.status = 'accepted' THEN
    RAISE EXCEPTION 'Este utilizador já aceitou o convite e possui acesso ao sistema.';
  END IF;

  IF inv.send_count >= 5 AND inv.last_sent_at IS NOT NULL AND inv.last_sent_at > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Limite de 5 reenvios por 24h atingido. Tente novamente mais tarde.';
  END IF;

  IF inv.status = 'revoked' THEN v_was_revoked := true; END IF;
  IF inv.status = 'expired' OR inv.expires_at < now() THEN v_was_expired := true; END IF;

  IF v_was_expired OR v_was_revoked THEN
    v_new_token := encode(extensions.gen_random_bytes(24), 'hex');
    UPDATE public.invites SET
      token = v_new_token, status = 'pending',
      expires_at = now() + interval '14 days', accepted_at = NULL,
      send_count = inv.send_count + 1, last_sent_at = now()
    WHERE invites.id = _invite_id
    RETURNING * INTO inv;
  ELSE
    UPDATE public.invites SET
      send_count = inv.send_count + 1, last_sent_at = now()
    WHERE invites.id = _invite_id
    RETURNING * INTO inv;
  END IF;

  RETURN QUERY SELECT inv.id, inv.email, inv.token, inv.role, inv.expires_at,
                      inv.company_id, inv.send_count, inv.last_sent_at,
                      v_was_expired, v_was_revoked;
END $$;

GRANT EXECUTE ON FUNCTION public.resend_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_or_resend_invite(
  _company_id uuid, _email text, _role app_role
)
RETURNS TABLE(
  id uuid, email text, token text, role app_role,
  expires_at timestamp with time zone, company_id uuid,
  send_count integer, last_sent_at timestamp with time zone,
  action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_user_id uuid;
  v_has_membership boolean := false;
  inv public.invites%ROWTYPE;
  v_new_token text;
  v_action text;
BEGIN
  IF NOT (public.is_company_manager(auth.uid(), _company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_email IS NULL OR v_email = '' THEN RAISE EXCEPTION 'Email obrigatório'; END IF;

  SELECT u.id INTO v_user_id FROM auth.users u WHERE lower(u.email) = v_email LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND company_id = _company_id
    ) INTO v_has_membership;
    IF v_has_membership THEN
      RAISE EXCEPTION 'Este utilizador já possui acesso ao sistema.';
    END IF;
  END IF;

  SELECT * INTO inv
  FROM public.invites
  WHERE lower(email) = v_email AND invites.company_id = _company_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF inv.send_count >= 5 AND inv.last_sent_at IS NOT NULL AND inv.last_sent_at > now() - interval '24 hours' THEN
      RAISE EXCEPTION 'Limite de 5 reenvios por 24h atingido. Tente novamente mais tarde.';
    END IF;

    IF inv.status = 'pending' AND inv.expires_at >= now() THEN
      UPDATE public.invites SET
        role = _role, send_count = inv.send_count + 1, last_sent_at = now()
      WHERE invites.id = inv.id RETURNING * INTO inv;
      v_action := 'resent';
    ELSE
      v_new_token := encode(extensions.gen_random_bytes(24), 'hex');
      UPDATE public.invites SET
        role = _role, token = v_new_token, status = 'pending',
        expires_at = now() + interval '14 days', accepted_at = NULL,
        send_count = inv.send_count + 1, last_sent_at = now()
      WHERE invites.id = inv.id RETURNING * INTO inv;
      v_action := 'reactivated';
    END IF;
  ELSE
    INSERT INTO public.invites(company_id, email, role, invited_by, last_sent_at)
    VALUES (_company_id, v_email, _role, auth.uid(), now())
    RETURNING * INTO inv;
    v_action := 'created';
  END IF;

  RETURN QUERY SELECT inv.id, inv.email, inv.token, inv.role, inv.expires_at,
                      inv.company_id, inv.send_count, inv.last_sent_at, v_action;
END $$;

GRANT EXECUTE ON FUNCTION public.create_or_resend_invite(uuid, text, app_role) TO authenticated;
