
CREATE OR REPLACE FUNCTION public.get_support_ticket_requester_info(_ticket_id uuid)
RETURNS TABLE(
  requester_user_id uuid,
  requester_full_name text,
  requester_email text,
  company_id uuid,
  company_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket RECORD;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT t.requester_user_id, t.company_id
    INTO v_ticket
  FROM public.support_tickets t
  WHERE t.id = _ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  -- RBAC: Super Admin sempre; caso contrário precisa pertencer à empresa (owner/manager)
  IF NOT public.has_role(v_uid, 'super_admin'::app_role) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid
        AND (p.current_company_id = v_ticket.company_id OR p.company_id_primary = v_ticket.company_id)
    ) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_ticket.requester_user_id,
    p.full_name,
    u.email::text,
    v_ticket.company_id,
    c.name
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.companies c ON c.id = v_ticket.company_id
  WHERE p.id = v_ticket.requester_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_support_ticket_requester_info(uuid) TO authenticated;
