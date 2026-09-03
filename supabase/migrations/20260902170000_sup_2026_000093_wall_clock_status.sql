-- SUP-2026-000093
-- Horarios de tarefa sao armazenados como wall-clock UTC para manter o horario
-- cadastrado. Comparacoes operacionais devem usar o fuso da empresa.

CREATE OR REPLACE FUNCTION public.tasks_sweep_absent(_company_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  WITH upd AS (
    UPDATE public.tasks t
       SET status = 'ausente', marked_absent_at = now(), updated_at = now(),
           absence_source = 'automatica'
      FROM public.companies c
     WHERE c.id = t.company_id
       AND t.status IN ('pendente', 'autorizado')
       AND t.archived_at IS NULL
       AND t.deleted_at IS NULL
       AND t.assigned_to IS NOT NULL
       AND t.scheduled_for IS NOT NULL
       AND t.scheduled_end IS NOT NULL
       AND NOT public.task_timing_is_manual(t.client_id)
       AND (
         now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'UTC')
       ) >= (
         (t.scheduled_for AT TIME ZONE 'UTC') + interval '24 hours'
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.time_entries te
          WHERE te.task_id = t.id AND te.voided_at IS NULL
       )
       AND (
         public.is_super_admin(v_uid)
         OR (_company_id IS NOT NULL AND t.company_id = _company_id AND public.is_company_manager(v_uid, t.company_id))
         OR (_company_id IS NULL AND public.is_company_manager(v_uid, t.company_id))
       )
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN COALESCE(v_count, 0);
END
$function$;

GRANT EXECUTE ON FUNCTION public.tasks_sweep_absent(uuid) TO authenticated, service_role;

-- Repara apenas ausencias automaticas ainda dentro do prazo correto. Faltas
-- manuais/funcionario e ausencias que ja passaram de 24h permanecem intactas.
UPDATE public.tasks t
   SET status = 'pendente',
       marked_absent_at = NULL,
       absence_source = NULL,
       updated_at = now()
  FROM public.companies c
 WHERE c.id = t.company_id
   AND t.status = 'ausente'
   AND t.absence_source = 'automatica'
   AND t.scheduled_for IS NOT NULL
   AND (
     now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'UTC')
   ) < (
     (t.scheduled_for AT TIME ZONE 'UTC') + interval '24 hours'
   );
