CREATE OR REPLACE FUNCTION public.support_sync_ticket_notifications(_ticket_id uuid, _claimed_by uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n int := 0;
BEGIN
  UPDATE public.notifications
     SET state = 'resolvida',
         state_changed_at = now(),
         state_changed_by = _claimed_by
   WHERE metadata->>'ticket_id' = _ticket_id::text
     AND state NOT IN ('resolvida', 'arquivada')
     AND (_claimed_by IS NULL OR user_id IS DISTINCT FROM _claimed_by);
  GET DIAGNOSTICS n = ROW_COUNT;

  IF _claimed_by IS NOT NULL THEN
    UPDATE public.notifications
       SET state = 'em_tratamento',
           state_changed_at = now(),
           state_changed_by = _claimed_by
     WHERE metadata->>'ticket_id' = _ticket_id::text
       AND user_id = _claimed_by
       AND state = 'nova';
  END IF;

  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.support_sync_ticket_notifications(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.row_count_safe();