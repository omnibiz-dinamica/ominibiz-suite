CREATE OR REPLACE FUNCTION public.support_has_destination_access(_user_id uuid, _company_id uuid, _destination_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
        FROM public.support_destinations d
        JOIN public.user_roles ur
          ON ur.user_id = _user_id
         AND ur.role::text = d.target_role
         AND (ur.company_id = _company_id OR d.is_technical)
       WHERE d.code = _destination_code
         AND d.target_role IS NOT NULL
    )
    OR EXISTS (
      -- Filas administrativas (Secretaria/Contabilidade): hoje a responsabilidade
      -- é do Gestor/Proprietário da empresa do ticket.
      SELECT 1
        FROM public.support_destinations d
        JOIN public.user_roles ur
          ON ur.user_id = _user_id
         AND ur.company_id = _company_id
         AND ur.role IN ('manager', 'owner')
       WHERE d.code = _destination_code
         AND COALESCE(d.is_technical, false) = false
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.update_support_ticket_priority(_ticket_id uuid, _new_priority support_ticket_priority)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  old_priority public.support_ticket_priority;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin(auth.uid())
     AND NOT public.support_has_destination_access(auth.uid(), ticket.company_id, ticket.destination_code) THEN
    RAISE EXCEPTION 'super_admin_only' USING ERRCODE = '42501';
  END IF;

  old_priority := ticket.priority;
  UPDATE public.support_tickets SET priority = _new_priority WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'priority_changed',
    jsonb_build_object('priority', old_priority),
    jsonb_build_object('priority', _new_priority),
    '{}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.support_has_destination_access(uuid, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.support_has_destination_access(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_support_ticket_priority(uuid, support_ticket_priority) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_support_ticket_priority(uuid, support_ticket_priority) TO authenticated, service_role;