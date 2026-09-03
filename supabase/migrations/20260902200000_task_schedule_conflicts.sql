-- SUP-2026-000140 — alerta operacional de sobreposição de tarefas.
-- A função só consulta: não bloqueia, altera ou cria tarefas.

CREATE OR REPLACE FUNCTION public.task_schedule_conflicts(
  _company_id uuid,
  _proposals jsonb,
  _exclude_task_id uuid DEFAULT NULL
)
RETURNS TABLE (
  assignee_id uuid,
  assignee_name text,
  conflicting_task_id uuid,
  conflicting_title text,
  conflicting_client_name text,
  conflicting_start timestamptz,
  conflicting_end timestamptz,
  overlap_start timestamptz,
  overlap_end timestamptz,
  proposed_start timestamptz,
  proposed_end timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH proposed AS (
    SELECT p.assignee_id, p.start_at, p.end_at
    FROM jsonb_to_recordset(COALESCE(_proposals, '[]'::jsonb)) AS p(
      assignee_id uuid,
      start_at timestamptz,
      end_at timestamptz
    )
    WHERE p.start_at IS NOT NULL
      AND p.end_at IS NOT NULL
      AND p.start_at < p.end_at
  )
  SELECT
    p.assignee_id,
    assignee.full_name,
    t.id,
    t.title,
    c.name,
    t.scheduled_for,
    t.scheduled_end,
    GREATEST(p.start_at, t.scheduled_for),
    LEAST(p.end_at, t.scheduled_end),
    p.start_at,
    p.end_at
  FROM proposed p
  JOIN public.tasks t
    ON t.company_id = _company_id
   AND t.assigned_to = p.assignee_id
   AND t.scheduled_for IS NOT NULL
   AND t.scheduled_end IS NOT NULL
   AND t.scheduled_for < p.end_at
   AND p.start_at < t.scheduled_end
   AND t.status IN ('pendente', 'autorizado', 'em_andamento')
   AND t.archived_at IS NULL
   AND t.deleted_at IS NULL
   AND (_exclude_task_id IS NULL OR t.id <> _exclude_task_id)
  LEFT JOIN public.profiles assignee ON assignee.id = t.assigned_to
  LEFT JOIN public.clients c ON c.id = t.client_id AND c.company_id = t.company_id
  WHERE public.is_company_manager(auth.uid(), _company_id)
  ORDER BY p.start_at, assignee.full_name NULLS LAST, t.scheduled_for;
$$;

REVOKE ALL ON FUNCTION public.task_schedule_conflicts(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_schedule_conflicts(uuid, jsonb, uuid) TO authenticated, service_role;
