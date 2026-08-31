-- Restore support ticket creation after the Super Admin notification inheritance
-- migration. A ticket UUID must live in metadata.ticket_id; notifications.task_id
-- is reserved for public.tasks(id) and rejects ticket UUIDs via its foreign key.
CREATE OR REPLACE FUNCTION public.support_notify_managers(
  _company_id uuid,
  _ticket_id uuid,
  _title text,
  _body text,
  _event public.notification_event,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
  count_inserted integer := 0;
BEGIN
  FOR target IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.company_id = _company_id
      AND ur.role IN ('manager', 'owner')
    UNION
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'super_admin'
  LOOP
    INSERT INTO public.notifications (
      company_id, user_id, task_id, event, title, body, priority, metadata
    )
    SELECT
      _company_id, target, NULL, _event, _title, _body, _priority,
      jsonb_build_object('ticket_id', _ticket_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.company_id = _company_id
        AND n.user_id = target
        AND n.task_id IS NULL
        AND n.event = _event
        AND n.title = _title
        AND n.body IS NOT DISTINCT FROM _body
        AND n.metadata = jsonb_build_object('ticket_id', _ticket_id)
    );

    IF FOUND THEN
      count_inserted := count_inserted + 1;
    END IF;
  END LOOP;

  RETURN count_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_managers(
  uuid, uuid, text, text, public.notification_event, public.notification_priority
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_notify_managers(
  uuid, uuid, text, text, public.notification_event, public.notification_priority
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_support_ticket(
  uuid, public.support_ticket_type, public.support_ticket_priority,
  text, text, text, text, text, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(
  uuid, public.support_ticket_type, public.support_ticket_priority,
  text, text, text, text, text, jsonb, text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
