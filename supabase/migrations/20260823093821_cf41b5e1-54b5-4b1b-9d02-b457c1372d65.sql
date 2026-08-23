-- =====================================================================
-- Pacote Operacional V2 · Fase B — Vínculos Cliente↔Responsável e
-- múltiplos responsáveis por tarefa (modelo fan-out por responsável).
-- Aditivo: nenhuma coluna/dado removido, RLS/RBAC intactos.
-- =====================================================================

-- 1) Identificador de grupo (lote) ------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_group_id uuid;
ALTER TABLE public.task_recurrences ADD COLUMN IF NOT EXISTS task_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_tasks_task_group_id
  ON public.tasks (task_group_id) WHERE task_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_recurrences_task_group_id
  ON public.task_recurrences (task_group_id) WHERE task_group_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.task_group_id IS
  'Fase B: lote de criação multi-responsável. Cada responsável tem a SUA tarefa (estado, ponto, recusa e conclusão próprios). NULL = tarefa individual/legada.';

-- 2) Equipe responsável ativa do cliente (fonte canônica: client_assignees)
CREATE OR REPLACE FUNCTION public.client_default_assignees(_client_id uuid)
RETURNS TABLE (user_id uuid, full_name text, is_primary boolean, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT c.company_id INTO v_company FROM public.clients c WHERE c.id = _client_id;
  IF v_company IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.is_company_manager(auth.uid(), v_company) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para consultar a equipe do cliente';
  END IF;

  RETURN QUERY
  SELECT ca.user_id,
         p.full_name,
         ca.is_primary,
         COALESCE(p.is_active, true) AS is_active
  FROM public.client_assignees ca
  LEFT JOIN public.profiles p ON p.id = ca.user_id
  WHERE ca.client_id = _client_id
    AND ca.company_id = v_company
    AND COALESCE(p.is_active, true) = true
  ORDER BY ca.is_primary DESC, p.full_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.client_default_assignees(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.client_default_assignees(uuid) TO authenticated;

-- 3) Progresso do grupo (leitura agregada, sem alterar estado de ninguém)
CREATE OR REPLACE FUNCTION public.task_group_progress(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task    public.tasks;
  v_manager boolean;
  v_total   int;
  v_done    int;
  v_running int;
  v_refused int;
  v_members jsonb;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id;
  IF v_task.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_manager := public.is_company_manager(auth.uid(), v_task.company_id)
               OR public.is_super_admin(auth.uid());

  IF NOT v_manager AND v_task.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão para consultar esta tarefa';
  END IF;

  IF v_task.task_group_id IS NULL THEN
    RETURN jsonb_build_object('total', 1, 'done', CASE WHEN v_task.status = 'concluido' THEN 1 ELSE 0 END,
                              'running', CASE WHEN v_task.status = 'em_andamento' THEN 1 ELSE 0 END,
                              'refused', 0, 'members', '[]'::jsonb);
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE t.status = 'concluido'),
         count(*) FILTER (WHERE t.status = 'em_andamento'),
         count(*) FILTER (WHERE t.refused_at IS NOT NULL)
    INTO v_total, v_done, v_running, v_refused
  FROM public.tasks t
  WHERE t.task_group_id = v_task.task_group_id
    AND t.deleted_at IS NULL;

  IF v_manager THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'task_id', t.id,
             'user_id', t.assigned_to,
             'full_name', p.full_name,
             'status', t.status,
             'refused_at', t.refused_at
           ) ORDER BY p.full_name NULLS LAST), '[]'::jsonb)
      INTO v_members
    FROM public.tasks t
    LEFT JOIN public.profiles p ON p.id = t.assigned_to
    WHERE t.task_group_id = v_task.task_group_id
      AND t.deleted_at IS NULL;
  ELSE
    v_members := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object('total', v_total, 'done', v_done, 'running', v_running,
                            'refused', v_refused, 'members', v_members);
END;
$$;

REVOKE ALL ON FUNCTION public.task_group_progress(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.task_group_progress(uuid) TO authenticated;

-- 4) Notificações: 1 por responsável; gestores 1 por lote (sem duplicação)
CREATE OR REPLACE FUNCTION public.tasks_notify_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mgr RECORD;
  v_prio public.notification_priority;
  v_first_of_group boolean;
BEGIN
  v_prio := CASE NEW.priority::text
              WHEN 'urgente' THEN 'urgente'::public.notification_priority
              WHEN 'alta' THEN 'alta'::public.notification_priority
              WHEN 'baixa' THEN 'baixa'::public.notification_priority
              ELSE 'media'::public.notification_priority END;

  -- Cada responsável recebe a sua própria notificação (uma única vez).
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> NEW.created_by THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
      'task_assigned', 'Nova tarefa atribuída', NEW.title, v_prio,
      jsonb_build_object('status', NEW.status, 'task_group_id', NEW.task_group_id));
  END IF;

  -- Fase B: num lote multi-responsável, gestores recebem UMA notificação.
  v_first_of_group := NEW.task_group_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.task_group_id = NEW.task_group_id AND t.id <> NEW.id
    );

  IF NOT public.is_company_manager(NEW.created_by, NEW.company_id) THEN
    IF v_first_of_group THEN
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
        WHERE company_id = NEW.company_id AND role IN ('manager','super_admin')
      LOOP
        PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
          'task_authorization_requested', 'Solicitação de autorização',
          NEW.title, 'alta', jsonb_build_object('created_by', NEW.created_by));
      END LOOP;
    END IF;
  ELSIF v_first_of_group THEN
    FOR v_mgr IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE company_id = NEW.company_id AND role = 'manager' AND user_id <> NEW.created_by
    LOOP
      PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
        'task_created', 'Nova tarefa criada', NEW.title, v_prio, '{}'::jsonb);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;