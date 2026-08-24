-- 1) Histórico permanente de recusas
CREATE TABLE IF NOT EXISTS public.task_refusals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  reason text NOT NULL,
  previous_status public.task_status NOT NULL,
  new_status public.task_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_refusals_task ON public.task_refusals(task_id);
CREATE INDEX IF NOT EXISTS idx_task_refusals_company ON public.task_refusals(company_id, created_at DESC);

GRANT SELECT ON public.task_refusals TO authenticated;
GRANT ALL ON public.task_refusals TO service_role;

ALTER TABLE public.task_refusals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers read company task refusals" ON public.task_refusals;
CREATE POLICY "managers read company task refusals"
ON public.task_refusals FOR SELECT TO authenticated
USING (public.is_company_manager(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "employees read own task refusals" ON public.task_refusals;
CREATE POLICY "employees read own task refusals"
ON public.task_refusals FOR SELECT TO authenticated
USING (employee_id = auth.uid());

-- 2) Transição canônica de recusa: idempotência, guarda de ponto aberto e auditoria
CREATE OR REPLACE FUNCTION public.task_transition(_task_id uuid, _action text, _reason text DEFAULT NULL::text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_uid UUID := auth.uid();
  v_is_manager BOOLEAN;
  v_is_assignee BOOLEAN;
  v_open_id UUID;
  v_punch_user UUID;
  v_started TIMESTAMPTZ;
  v_paused TIMESTAMPTZ;
  v_resumed TIMESTAMPTZ;
  v_total_sec NUMERIC;
  v_pause_sec NUMERIC;
  v_prev_status public.task_status;
  v_reason TEXT := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := (v_task.assigned_to = v_uid);

  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissao para esta tarefa';
  END IF;

  IF _action = 'autorizar' THEN
    IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode autorizar'; END IF;
    IF v_task.status <> 'pendente' THEN RAISE EXCEPTION 'So e possivel autorizar tarefa pendente'; END IF;
    UPDATE public.tasks SET status = 'autorizado', authorized_at = now(), authorized_by = v_uid
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'iniciar' THEN
    IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissao'; END IF;

    v_punch_user := v_task.assigned_to;
    IF v_punch_user IS NULL THEN
      RAISE EXCEPTION 'Tarefa precisa de um responsavel antes de iniciar';
    END IF;

    SELECT id INTO v_open_id FROM public.time_entries
     WHERE user_id = v_punch_user
       AND task_id = v_task.id
       AND ended_at IS NULL
     LIMIT 1;

    IF v_task.status = 'em_andamento' AND v_open_id IS NOT NULL THEN
      RETURN v_task;
    END IF;

    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Tarefa nao pode ser iniciada no status atual: %', v_task.status;
    END IF;

    SELECT id INTO v_open_id FROM public.time_entries
     WHERE user_id = v_punch_user AND ended_at IS NULL
     LIMIT 1;
    IF v_open_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ja existe um ponto aberto para este usuario. Conclua-o antes de iniciar outra tarefa.';
    END IF;

    UPDATE public.tasks SET status = 'em_andamento', started_at = COALESCE(started_at, now())
      WHERE id = _task_id RETURNING * INTO v_task;

    INSERT INTO public.time_entries (company_id, task_id, user_id, started_at)
    VALUES (v_task.company_id, v_task.id, v_punch_user, now());

  ELSIF _action = 'recusar' THEN
    IF NOT v_is_assignee THEN RAISE EXCEPTION 'Apenas o responsavel pode recusar a tarefa'; END IF;

    -- Idempotência: clique duplo devolve a mesma recusa, sem nova transição/notificação.
    IF v_task.status = 'cancelado' AND v_task.refused_by = v_uid THEN
      RETURN v_task;
    END IF;

    -- Tarefa com ponto aberto não pode ser recusada diretamente.
    SELECT id INTO v_open_id FROM public.time_entries
     WHERE task_id = v_task.id AND ended_at IS NULL
     LIMIT 1;
    IF v_open_id IS NOT NULL THEN
      RAISE EXCEPTION 'Esta tarefa ja foi iniciada. Finalize ou regularize o ponto antes de recusa-la.';
    END IF;

    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode ser recusada';
    END IF;
    IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da recusa obrigatorio'; END IF;

    v_prev_status := v_task.status;

    UPDATE public.tasks
       SET status = 'cancelado',
           cancelled_at = now(),
           cancelled_by = v_uid,
           refusal_reason = v_reason,
           refused_at = now(),
           refused_by = v_uid
     WHERE id = _task_id RETURNING * INTO v_task;

    INSERT INTO public.task_refusals (
      company_id, task_id, employee_id, actor_id, reason, previous_status, new_status
    ) VALUES (
      v_task.company_id, v_task.id, v_uid, v_uid, v_reason, v_prev_status, 'cancelado'
    );

  ELSIF _action IN ('concluir','cancelar','marcar_ausente') THEN
    IF _action = 'concluir' THEN
      IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissao'; END IF;
      IF v_task.status <> 'em_andamento' THEN
        RAISE EXCEPTION 'Apenas tarefa em andamento pode ser concluida';
      END IF;
      UPDATE public.tasks SET status = 'concluido', completed_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSIF _action = 'cancelar' THEN
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode cancelar'; END IF;
      IF v_task.status IN ('concluido','cancelado','ausente') THEN
        RAISE EXCEPTION 'Tarefa ja finalizada';
      END IF;
      UPDATE public.tasks SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSE
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode marcar ausencia'; END IF;
      IF public.task_timing_is_manual(v_task.client_id) THEN
        RAISE EXCEPTION 'Cliente em modo de apontamento manual nao permite marcacao de ausencia';
      END IF;
      IF v_task.status NOT IN ('pendente','autorizado') THEN
        RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode virar ausente';
      END IF;
      UPDATE public.tasks SET status = 'ausente', marked_absent_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    END IF;

    FOR v_open_id, v_started, v_paused, v_resumed IN
      SELECT id, started_at, paused_at, resumed_at
        FROM public.time_entries
       WHERE task_id = v_task.id AND ended_at IS NULL
    LOOP
      v_pause_sec := 0;
      IF v_paused IS NOT NULL AND v_resumed IS NULL THEN
        v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_paused)));
      ELSIF v_paused IS NOT NULL AND v_resumed IS NOT NULL THEN
        v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_resumed - v_paused)));
      END IF;
      v_total_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_started)) - v_pause_sec);

      UPDATE public.time_entries
         SET ended_at = now(),
             effective_minutes = public.effective_minutes_round(v_total_sec, 0)
       WHERE id = v_open_id;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Acao invalida: %', _action;
  END IF;

  RETURN v_task;
END
$function$;

-- 3) Notificação específica de recusa para gestores/proprietários
CREATE OR REPLACE FUNCTION public.tasks_notify_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mgr RECORD;
  v_employee text;
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_to IS NOT NULL THEN
    PERFORM public._notify(
      NEW.company_id, NEW.assigned_to, NEW.id,
      'task_assigned', 'Tarefa atribuida a voce', NEW.title, 'media', '{}'::jsonb
    );
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'autorizado' THEN
      PERFORM public._notify(
        NEW.company_id, NEW.created_by, NEW.id,
        'task_authorized', 'Tarefa autorizada', NEW.title, 'media',
        jsonb_build_object('authorized_by', NEW.authorized_by)
      );

      IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> NEW.created_by THEN
        PERFORM public._notify(
          NEW.company_id, NEW.assigned_to, NEW.id,
          'task_authorized', 'Tarefa autorizada', NEW.title, 'media', '{}'::jsonb
        );
      END IF;

    ELSIF NEW.status = 'cancelado' AND NEW.refused_by IS NOT NULL AND OLD.refused_by IS NULL THEN
      -- Recusa pelo responsável: gestores e proprietários são os destinatários.
      SELECT full_name INTO v_employee FROM public.profiles WHERE id = NEW.refused_by;

      FOR v_mgr IN
        SELECT DISTINCT user_id
        FROM public.user_roles
        WHERE company_id = NEW.company_id
          AND role IN ('manager','owner')
          AND user_id <> NEW.refused_by
      LOOP
        PERFORM public._notify(
          NEW.company_id, v_mgr.user_id, NEW.id,
          'task_rejected', 'Tarefa recusada',
          COALESCE(v_employee, 'O funcionario') || ' recusou a tarefa ' || NEW.title
            || '. Motivo: ' || COALESCE(NEW.refusal_reason, '-'),
          'alta',
          jsonb_build_object(
            'refused_by', NEW.refused_by,
            'employee_name', v_employee,
            'refusal_reason', NEW.refusal_reason,
            'refused_at', NEW.refused_at,
            'client_id', NEW.client_id,
            'scheduled_for', NEW.scheduled_for,
            'task_id', NEW.id,
            'link', '/app/tarefas?status=recusadas&task=' || NEW.id::text
          )
        );
      END LOOP;

    ELSIF NEW.status = 'cancelado' THEN
      IF OLD.status = 'pendente' AND NOT public.is_company_manager(NEW.created_by, NEW.company_id) THEN
        PERFORM public._notify(
          NEW.company_id, NEW.created_by, NEW.id,
          'task_rejected', 'Solicitacao rejeitada', NEW.title, 'alta',
          jsonb_build_object('rejected_by', NEW.cancelled_by)
        );
      ELSE
        IF NEW.assigned_to IS NOT NULL THEN
          PERFORM public._notify(
            NEW.company_id, NEW.assigned_to, NEW.id,
            'task_cancelled', 'Tarefa cancelada', NEW.title, 'media', '{}'::jsonb
          );
        END IF;

        IF NEW.created_by IS NOT NULL
           AND NEW.created_by <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) THEN
          PERFORM public._notify(
            NEW.company_id, NEW.created_by, NEW.id,
            'task_cancelled', 'Tarefa cancelada', NEW.title, 'media', '{}'::jsonb
          );
        END IF;
      END IF;

    ELSIF NEW.status = 'ausente' THEN
      FOR v_mgr IN
        SELECT DISTINCT user_id
        FROM public.user_roles
        WHERE company_id = NEW.company_id
          AND role = 'manager'
      LOOP
        PERFORM public._notify(
          NEW.company_id, v_mgr.user_id, NEW.id,
          'task_marked_absent', 'Tarefa marcada como ausente', NEW.title, 'alta', '{}'::jsonb
        );
      END LOOP;

      IF NEW.assigned_to IS NOT NULL THEN
        PERFORM public._notify(
          NEW.company_id, NEW.assigned_to, NEW.id,
          'task_marked_absent', 'Sua tarefa foi marcada como ausente', NEW.title, 'alta', '{}'::jsonb
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Reatribuição de tarefa recusada (gestor), preservando o histórico
CREATE OR REPLACE FUNCTION public.task_reassign_from_refusal(_task_id uuid, _new_user uuid)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  IF NOT public.is_company_manager(v_uid, v_task.company_id) THEN
    RAISE EXCEPTION 'Apenas gestor pode reatribuir a tarefa';
  END IF;

  IF v_task.refused_by IS NULL OR v_task.status <> 'cancelado' THEN
    RAISE EXCEPTION 'Esta tarefa nao esta recusada';
  END IF;

  IF NOT public.is_company_member(_new_user, v_task.company_id) THEN
    RAISE EXCEPTION 'Novo responsavel nao pertence a empresa';
  END IF;

  UPDATE public.tasks
     SET assigned_to = _new_user,
         status = 'pendente',
         cancelled_at = NULL,
         cancelled_by = NULL,
         refusal_reason = NULL,
         refused_at = NULL,
         refused_by = NULL,
         started_at = NULL,
         completed_at = NULL,
         authorized_at = NULL,
         authorized_by = NULL
   WHERE id = _task_id
  RETURNING * INTO v_task;

  RETURN v_task;
END
$function$;

REVOKE ALL ON FUNCTION public.task_reassign_from_refusal(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.task_reassign_from_refusal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_reassign_from_refusal(uuid, uuid) TO service_role;