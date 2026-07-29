REVOKE EXECUTE ON FUNCTION public.task_timing_is_manual(uuid) FROM PUBLIC, anon;

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
    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode ser recusada';
    END IF;
    IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da recusa obrigatorio'; END IF;
    UPDATE public.tasks
       SET status = 'cancelado',
           cancelled_at = now(),
           cancelled_by = v_uid,
           refusal_reason = v_reason,
           refused_at = now(),
           refused_by = v_uid
     WHERE id = _task_id RETURNING * INTO v_task;

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
             effective_minutes = public.effective_minutes_round(v_total_sec / 60.0)
       WHERE id = v_open_id;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Acao invalida: %', _action;
  END IF;

  RETURN v_task;
END
$function$;