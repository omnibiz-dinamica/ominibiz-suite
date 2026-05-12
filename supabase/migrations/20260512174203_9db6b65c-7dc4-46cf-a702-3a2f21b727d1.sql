
CREATE OR REPLACE FUNCTION public.get_invite_preview(_token TEXT)
RETURNS TABLE(email TEXT, company_name TEXT, status invite_status, expires_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.email, c.name, i.status, i.expires_at
  FROM public.invites i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = _token
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_preview(TEXT) TO anon, authenticated;
