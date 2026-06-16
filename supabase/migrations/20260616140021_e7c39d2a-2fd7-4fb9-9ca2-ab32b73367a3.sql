ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_count INT NOT NULL DEFAULT 1;

UPDATE public.invites SET last_sent_at = created_at WHERE last_sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.resend_invite(_invite_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  token TEXT,
  role app_role,
  expires_at TIMESTAMPTZ,
  company_id UUID,
  send_count INT,
  last_sent_at TIMESTAMPTZ,
  was_expired BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invites%ROWTYPE;
  v_was_expired BOOLEAN := false;
  v_new_token TEXT;
BEGIN
  SELECT * INTO inv FROM public.invites WHERE invites.id = _invite_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite não encontrado';
  END IF;

  IF NOT (public.is_company_manager(auth.uid(), inv.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden: sem permissão para reenviar este convite';
  END IF;

  IF inv.status IN ('accepted','revoked') THEN
    RAISE EXCEPTION 'Convite não pode ser reenviado (status: %)', inv.status;
  END IF;

  IF inv.send_count >= 5 AND inv.last_sent_at IS NOT NULL AND inv.last_sent_at > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Limite de 5 reenvios por 24h atingido. Tente novamente mais tarde.';
  END IF;

  IF inv.status = 'expired' OR inv.expires_at < now() THEN
    v_was_expired := true;
    v_new_token := encode(extensions.gen_random_bytes(24), 'hex');
    UPDATE public.invites
      SET token = v_new_token,
          expires_at = now() + interval '14 days',
          status = 'pending',
          send_count = invites.send_count + 1,
          last_sent_at = now()
      WHERE invites.id = _invite_id
      RETURNING * INTO inv;
  ELSE
    UPDATE public.invites
      SET send_count = invites.send_count + 1,
          last_sent_at = now()
      WHERE invites.id = _invite_id
      RETURNING * INTO inv;
  END IF;

  RETURN QUERY SELECT inv.id, inv.email, inv.token, inv.role, inv.expires_at, inv.company_id, inv.send_count, inv.last_sent_at, v_was_expired;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resend_invite(uuid) TO authenticated;