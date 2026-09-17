CREATE OR REPLACE FUNCTION public.tasks_audit_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_origin text;
  v_actor uuid;
  v_role text;
BEGIN
  -- actor_user_id é NOT NULL no histórico: para origens automáticas registra-se
  -- o criador da série, e a ORIGEM real fica no campo reason.
  v_actor := NEW.created_by;

  IF NEW.recurrence_id IS NULL THEN
    v_origin := 'manual';
  ELSIF EXISTS (
    SELECT 1 FROM public.task_recurrences r
    WHERE r.id = NEW.recurrence_id
      AND r.created_at > now() - interval '5 seconds'
  ) THEN
    v_origin := 'recurrence_seed';
  ELSE
    v_origin := 'recurrence';
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT ur.role::text INTO v_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_actor AND ur.company_id = NEW.company_id
    ORDER BY CASE ur.role::text WHEN 'super_admin' THEN 0 WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END
    LIMIT 1;
  END IF;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event, reason,
    recurrence_id, occurrence_date
  ) VALUES (
    NEW.company_id, NEW.id, v_actor, v_role, 'created', v_origin,
    NEW.recurrence_id, NEW.recurrence_date
  );

  RETURN NEW;
END;
$function$;