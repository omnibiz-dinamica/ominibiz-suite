
-- Helper: calcula minutos efetivos com arredondamento half-up consistente.
-- Recebe total de segundos brutos e segundos de pausa, devolve minutos arredondados.
CREATE OR REPLACE FUNCTION public.effective_minutes_round(_total_seconds numeric, _pause_seconds numeric)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, round(GREATEST(0::numeric, COALESCE(_total_seconds,0) - COALESCE(_pause_seconds,0)) / 60.0))::int;
$$;

-- ============ task_transition (concluir/cancelar/marcar_ausente fecham ponto) ============
CREATE OR REPLACE FUNCTION public.task_transition(_task_id uuid, _action text)
RETURNS public.tasks
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := (v_task.assigned_to = v_uid);

  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissão para esta tarefa';
  END IF;

  IF _action = 'autorizar' THEN
    IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode autorizar'; END IF;
    IF v_task.status <> 'pendente' THEN RAISE EXCEPTION 'Só é possível autorizar tarefa pendente'; END IF;
    UPDATE public.tasks SET status = 'autorizado', authorized_at = now(), authorized_by = v_uid
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'iniciar' THEN
    IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Tarefa não pode ser iniciada no status atual: %', v_task.status;
    END IF;
    IF v_task.assigned_to IS NULL THEN
      RAISE EXCEPTION 'Tarefa precisa de um responsável antes de iniciar';
    END IF;

    v_punch_user := v_task.assigned_to;
    SELECT id INTO v_open_id FROM public.time_entries
     WHERE user_id = v_punch_user AND ended_at IS NULL
     LIMIT 1;
    IF v_open_id IS NOT NULL THEN
      RAISE EXCEPTION 'Já existe um ponto aberto para este usuário. Conclua-o antes de iniciar outra tarefa.';
    END IF;

    UPDATE public.tasks SET status = 'em_andamento', started_at = COALESCE(started_at, now())
      WHERE id = _task_id RETURNING * INTO v_task;

    INSERT INTO public.time_entries (company_id, task_id, user_id, started_at)
    VALUES (v_task.company_id, v_task.id, v_punch_user, now());

  ELSIF _action IN ('concluir','cancelar','marcar_ausente') THEN
    IF _action = 'concluir' THEN
      IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissão'; END IF;
      IF v_task.status <> 'em_andamento' THEN
        RAISE EXCEPTION 'Apenas tarefa em andamento pode ser concluída';
      END IF;
      UPDATE public.tasks SET status = 'concluido', completed_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSIF _action = 'cancelar' THEN
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode cancelar'; END IF;
      IF v_task.status IN ('concluido','cancelado','ausente') THEN
        RAISE EXCEPTION 'Tarefa já finalizada';
      END IF;
      UPDATE public.tasks SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSE
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode marcar ausência'; END IF;
      IF v_task.status NOT IN ('pendente','autorizado') THEN
        RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode virar ausente';
      END IF;
      UPDATE public.tasks SET status = 'ausente', marked_absent_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    END IF;

    -- Encerra qualquer ponto aberto vinculado a esta tarefa (arredondamento half-up unificado)
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
      v_total_sec := EXTRACT(EPOCH FROM (now() - v_started));

      UPDATE public.time_entries
         SET ended_at = now(),
             resumed_at = COALESCE(resumed_at, CASE WHEN paused_at IS NOT NULL THEN now() ELSE NULL END),
             effective_minutes = public.effective_minutes_round(v_total_sec, v_pause_sec)
       WHERE id = v_open_id;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Ação inválida: %', _action;
  END IF;

  RETURN v_task;
END $function$;

-- ============ punch_manual_end ============
CREATE OR REPLACE FUNCTION public.punch_manual_end(_task_id uuid)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_entry public.time_entries%ROWTYPE;
  v_pause_sec numeric := 0;
  v_total_sec numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;
  IF v_task.assigned_to <> v_uid AND NOT public.is_company_manager(v_uid, v_task.company_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_entry FROM public.time_entries
   WHERE task_id = _task_id AND ended_at IS NULL
   ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum ponto aberto para esta tarefa'; END IF;

  IF v_entry.paused_at IS NOT NULL AND v_entry.resumed_at IS NULL THEN
    v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_entry.paused_at)));
  ELSIF v_entry.paused_at IS NOT NULL THEN
    v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_entry.resumed_at - v_entry.paused_at)));
  END IF;
  v_total_sec := EXTRACT(EPOCH FROM (now() - v_entry.started_at));

  UPDATE public.time_entries
     SET ended_at = now(),
         resumed_at = COALESCE(resumed_at, CASE WHEN paused_at IS NOT NULL THEN now() ELSE NULL END),
         effective_minutes = public.effective_minutes_round(v_total_sec, v_pause_sec)
   WHERE id = v_entry.id
   RETURNING * INTO v_entry;

  RETURN v_entry;
END $$;
