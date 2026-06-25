
CREATE OR REPLACE FUNCTION public.create_or_resend_invite(_company_id uuid, _email text, _role app_role)
 RETURNS TABLE(id uuid, email text, token text, role app_role, expires_at timestamp with time zone, company_id uuid, send_count integer, last_sent_at timestamp with time zone, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_user_id AND ur.company_id = _company_id
    ) INTO v_has_membership;
    IF v_has_membership THEN
      RAISE EXCEPTION 'Este utilizador já possui acesso ao sistema.';
    END IF;
  END IF;

  SELECT i.* INTO inv
  FROM public.invites i
  WHERE lower(i.email) = v_email AND i.company_id = _company_id
  ORDER BY i.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF inv.send_count >= 5 AND inv.last_sent_at IS NOT NULL AND inv.last_sent_at > now() - interval '24 hours' THEN
      RAISE EXCEPTION 'Limite de 5 reenvios por 24h atingido. Tente novamente mais tarde.';
    END IF;

    IF inv.status = 'pending' AND inv.expires_at >= now() THEN
      UPDATE public.invites AS i SET
        role = _role,
        send_count = inv.send_count + 1,
        last_sent_at = now()
      WHERE i.id = inv.id
      RETURNING i.* INTO inv;
      v_action := 'resent';
    ELSE
      v_new_token := encode(extensions.gen_random_bytes(24), 'hex');
      UPDATE public.invites AS i SET
        role = _role,
        token = v_new_token,
        status = 'pending',
        expires_at = now() + interval '14 days',
        accepted_at = NULL,
        send_count = inv.send_count + 1,
        last_sent_at = now()
      WHERE i.id = inv.id
      RETURNING i.* INTO inv;
      v_action := 'reactivated';
    END IF;
  ELSE
    INSERT INTO public.invites AS i (company_id, email, role, invited_by, last_sent_at)
    VALUES (_company_id, v_email, _role, auth.uid(), now())
    RETURNING i.* INTO inv;
    v_action := 'created';
  END IF;

  RETURN QUERY SELECT inv.id, inv.email, inv.token, inv.role, inv.expires_at,
                      inv.company_id, inv.send_count, inv.last_sent_at, v_action;
END $function$;
