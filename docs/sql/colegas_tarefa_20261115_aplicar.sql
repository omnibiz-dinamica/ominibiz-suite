-- =====================================================================
-- OmniBiz · 15/11/2026 — SUP-2026-000242: o funcionário vê os COLEGAS que
-- fazem a mesma tarefa. Desfazer: colegas_tarefa_20261115_desfazer.sql
--
-- Só leitura. O funcionário só lê as próprias tarefas (RLS), por isso não vê
-- as dos colegas; esta função devolve apenas o NOME (e o estado) dos colegas
-- da mesma ocorrência, e só para tarefas que são dele (ou gestor da empresa /
-- super admin). Nada mais dos colegas é exposto.
--
-- "Mesma tarefa" =
--   a) mesmo grupo (task_group_id: criada para várias pessoas de uma vez,
--      também nas recorrentes) E mesmo dia; ou
--   b) mesmo cliente E mesmo início (scheduled_for) — tarefas antigas sem grupo.
-- Fora: apagadas, arquivadas, canceladas/recusadas e o próprio funcionário.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.my_task_colleagues(uuid[])') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.is_company_manager(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_super_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PARAR: faltam as funções de permissão. Nada foi alterado.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks'
      AND column_name IN ('task_group_id', 'recurrence_date', 'scheduled_for', 'client_id', 'assigned_to',
                          'deleted_at', 'archived_at', 'status', 'company_id')) <> 9 THEN
    RAISE EXCEPTION 'PARAR: a tabela tasks não tem as colunas esperadas. Nada foi alterado.';
  END IF;
END
$guard$;

CREATE FUNCTION public.my_task_colleagues(_task_ids uuid[])
RETURNS TABLE (task_id uuid, colleague_id uuid, colleague_name text, colleague_status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH mine AS (
    SELECT t.*
    FROM public.tasks t
    WHERE t.id = ANY ((COALESCE(_task_ids, '{}'::uuid[]))[1:200])
      AND t.deleted_at IS NULL
      AND auth.uid() IS NOT NULL
      AND (t.assigned_to = auth.uid()
           OR public.is_company_manager(auth.uid(), t.company_id)
           OR public.is_super_admin(auth.uid()))
  )
  SELECT DISTINCT ON (m.id, o.assigned_to)
         m.id, o.assigned_to, COALESCE(NULLIF(btrim(p.full_name), ''), 'Colega'), o.status::text
  FROM mine m
  JOIN public.tasks o
    ON o.company_id = m.company_id
   AND o.id <> m.id
   AND o.deleted_at IS NULL
   AND o.archived_at IS NULL
   AND o.status::text <> 'cancelado'
   AND o.assigned_to IS NOT NULL
   AND o.assigned_to IS DISTINCT FROM m.assigned_to
   AND (
         (m.task_group_id IS NOT NULL AND o.task_group_id = m.task_group_id
          AND COALESCE(o.recurrence_date, (o.scheduled_for AT TIME ZONE 'UTC')::date)
              = COALESCE(m.recurrence_date, (m.scheduled_for AT TIME ZONE 'UTC')::date))
      OR (m.client_id IS NOT NULL AND o.client_id = m.client_id
          AND m.scheduled_for IS NOT NULL AND o.scheduled_for = m.scheduled_for)
       )
  LEFT JOIN public.profiles p ON p.id = o.assigned_to
  ORDER BY m.id, o.assigned_to;
$function$;

REVOKE ALL ON FUNCTION public.my_task_colleagues(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_task_colleagues(uuid[]) TO authenticated, service_role;

COMMIT;

SELECT jsonb_build_object(
  'funcao_criada', to_regprocedure('public.my_task_colleagues(uuid[])') IS NOT NULL,
  'tarefas_proximos_14_dias_com_colegas', (
    SELECT count(DISTINCT t.id) FROM public.tasks t
    WHERE t.deleted_at IS NULL AND t.archived_at IS NULL AND t.status::text <> 'cancelado'
      AND COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date) BETWEEN current_date AND current_date + 14
      AND EXISTS (SELECT 1 FROM public.tasks o
                  WHERE o.company_id = t.company_id AND o.id <> t.id AND o.deleted_at IS NULL AND o.archived_at IS NULL
                    AND o.status::text <> 'cancelado' AND o.assigned_to IS DISTINCT FROM t.assigned_to
                    AND ((t.task_group_id IS NOT NULL AND o.task_group_id = t.task_group_id
                          AND COALESCE(o.recurrence_date, (o.scheduled_for AT TIME ZONE 'UTC')::date)
                              = COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date))
                      OR (t.client_id IS NOT NULL AND o.client_id = t.client_id
                          AND t.scheduled_for IS NOT NULL AND o.scheduled_for = t.scheduled_for))))
)::text AS resultado;
