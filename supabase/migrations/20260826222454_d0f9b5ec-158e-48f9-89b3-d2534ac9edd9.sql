-- Fix: support_related_tickets referenced public.profiles.email (nonexistent),
-- raising "column p.email does not exist" whenever the affected-users branch ran.
-- Email fallback now comes from auth.users (function is SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.support_related_tickets(_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  t public.support_tickets%ROWTYPE;
  v_can_manage boolean;
  v_links jsonb;
  v_affected jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  v_is_sa := public.is_super_admin(v_uid);
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;

  v_can_manage := v_is_sa OR public.is_company_manager(v_uid, t.company_id);
  IF NOT (v_can_manage OR t.requester_user_id = v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO v_links
  FROM (
    SELECT jsonb_build_object(
      'link_id', l.id,
      'relation', l.relation,
      'direction', CASE WHEN l.ticket_id = _ticket_id THEN 'outgoing' ELSE 'incoming' END,
      'note', l.note,
      'created_at', l.created_at,
      'ticket', jsonb_build_object(
        'id', o.id,
        'ticket_number', o.ticket_number,
        'title', o.title,
        'status', o.status,
        'priority', o.priority,
        'created_at', o.created_at,
        'same_company', (o.company_id = t.company_id)
      )
    ) AS x
    FROM public.support_ticket_links l
    JOIN public.support_tickets o
      ON o.id = CASE WHEN l.ticket_id = _ticket_id THEN l.related_ticket_id ELSE l.ticket_id END
    WHERE (l.ticket_id = _ticket_id OR l.related_ticket_id = _ticket_id)
      AND (v_is_sa OR o.company_id = t.company_id)
  ) q;

  IF v_can_manage THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', a.id,
             'created_at', a.created_at,
             'note', a.note,
             'same_company', (a.company_id = t.company_id),
             'user_name', CASE WHEN a.company_id = t.company_id OR v_is_sa
                               THEN COALESCE(NULLIF(btrim(p.full_name), ''), au.email) ELSE NULL END
           ) ORDER BY a.created_at DESC), '[]'::jsonb) INTO v_affected
      FROM public.support_ticket_affected a
      LEFT JOIN public.profiles p ON p.id = a.user_id
      LEFT JOIN auth.users au ON au.id = a.user_id
     WHERE a.ticket_id = _ticket_id;
  ELSE
    v_affected := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'can_manage', v_can_manage,
    'primary_ticket_id', t.primary_ticket_id,
    'links', v_links,
    'affected', v_affected,
    'affected_count', (SELECT count(*) FROM public.support_ticket_affected a WHERE a.ticket_id = _ticket_id)
  );
END;
$function$;