-- ADR-044 — Registo formal de falta (SUP-2026-000073)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS marked_absent_by uuid,
  ADD COLUMN IF NOT EXISTS absence_reason text,
  ADD COLUMN IF NOT EXISTS absence_justified boolean,
  ADD COLUMN IF NOT EXISTS absence_source text;

ALTER TABLE public.task_audit_events DROP CONSTRAINT IF EXISTS task_audit_events_event_check;
ALTER TABLE public.task_audit_events
  ADD CONSTRAINT task_audit_events_event_check
  CHECK (event IN ('cancel','archive','unarchive','absence'));

CREATE OR REPLACE FUNCTION public.task_mark_absent(
  _task_id uuid,
  _reason text,
  _justified boolean DEFAULT false
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_manager boolean;
  v_open_id uuid;
  v_prev public.task_status;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da falta obrigatorio'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode marcar falta'; END IF;

  IF v_task.assigned_to IS NULL THEN
    RAISE EXCEPTION 'Tarefa sem responsavel nao permite marcacao de falta';
  END IF;

  IF v_task.status NOT IN ('pendente','autorizado','em_andamento','ausente') THEN
    RAISE EXCEPTION 'Tarefa ja finalizada nao permite marcacao de falta';
  END IF;

  SELECT id INTO v_open_id FROM public.time_entries
   WHERE task_id = v_task.id AND ended_at IS NULL
   LIMIT 1;
  IF v_open_id IS NOT NULL THEN
    RAISE EXCEPTION 'TASK_HAS_OPEN_PUNCH';
  END IF;

  v_prev := v_task.status;

  UPDATE public.tasks
     SET status = 'ausente',
         marked_absent_at = COALESCE(marked_absent_at, now()),
         marked_absent_by = v_uid,
         absence_reason = v_reason,
         absence_justified = COALESCE(_justified, false),
         absence_source = 'manual'
   WHERE id = _task_id
   RETURNING * INTO v_task;

  INSERT INTO public.task_audit_events (
    company_id, task_id, actor_user_id, actor_role, event,
    previous_status, new_status, reason
  ) VALUES (
    v_task.company_id, v_task.id, v_uid, 'manager', 'absence',
    v_prev, 'ausente',
    CASE WHEN COALESCE(_justified, false) THEN 'Falta justificada: ' ELSE 'Falta injustificada: ' END || v_reason
  );

  RETURN v_task;
END
$function$;

REVOKE ALL ON FUNCTION public.task_mark_absent(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.task_mark_absent(uuid, text, boolean) TO authenticated;