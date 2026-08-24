CREATE OR REPLACE FUNCTION public.punch_recover_open_entry(
  _time_entry_id uuid,
  _ended_at timestamptz,
  _reason_code text,
  _reason_text text DEFAULT NULL,
  _complete_task boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.time_entries%ROWTYPE;
  v_is_self boolean;
  v_is_manager boolean;
  v_next_started timestamptz;
  v_pause_sec numeric := 0;
  v_total_sec numeric;
  v_eff int;
  v_code text := NULLIF(btrim(COALESCE(_reason_code, '')), '');
  v_text text := NULLIF(btrim(COALESCE(_reason_text, '')), '');
  v_origin text;
  v_old_origin text;
  v_actor_role text;
  v_reason_full text;
  v_task_title text;
  v_manager_name text;
  v_employee_name text;
  m record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED', 'message', 'Nao autenticado.');
  END IF;
  IF _time_entry_id IS NULL OR _ended_at IS NULL OR v_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'message', 'Registo, hora de saida e motivo sao obrigatorios.');
  END IF;
  IF v_code = 'outro' AND v_text IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'message', 'Descreva o motivo quando escolher "Outro".');
  END IF;

  SELECT * INTO v_entry FROM public.time_entries WHERE id = _time_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ENTRY_NOT_FOUND', 'message', 'Registo de ponto nao encontrado.');
  END IF;
  IF v_entry.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CLOSED', 'message', 'Este ponto ja foi finalizado.', 'data', jsonb_build_object('time_entry_id', v_entry.id));
  END IF;

  v_is_self := v_entry.user_id = v_uid;
  v_is_manager := public.is_company_manager(v_uid, v_entry.company_id) OR public.is_super_admin(v_uid);

  IF NOT (v_is_self OR v_is_manager) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Sem permissao para regularizar este ponto.');
  END IF;

  IF _ended_at < v_entry.started_at THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_RANGE', 'message', 'A hora de saida nao pode ser anterior a hora de entrada.');
  END IF;
  IF _ended_at > now() + interval '5 minutes' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_RANGE', 'message', 'A hora de saida nao pode ser no futuro.');
  END IF;

  SELECT MIN(started_at) INTO v_next_started
    FROM public.time_entries
   WHERE user_id = v_entry.user_id
     AND id <> v_entry.id
     AND started_at > v_entry.started_at;

  IF v_next_started IS NOT NULL AND _ended_at > v_next_started THEN
    RETURN jsonb_build_object('success', false, 'code', 'OVERLAP', 'message',
      'A hora de saida sobrepoe um registo posterior. Escolha uma hora anterior a ' || to_char(v_next_started, 'DD/MM/YYYY HH24:MI') || '.');
  END IF;

  IF v_entry.paused_at IS NOT NULL THEN
    v_pause_sec := GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(v_entry.resumed_at, _ended_at) - v_entry.paused_at)));
  END IF;
  v_total_sec := EXTRACT(EPOCH FROM (_ended_at - v_entry.started_at));
  v_eff := public.effective_minutes_round(v_total_sec, v_pause_sec);

  v_actor_role := CASE WHEN v_is_self AND NOT v_is_manager THEN 'employee' ELSE 'manager' END;
  v_origin := CASE WHEN v_actor_role = 'employee' THEN 'manual_adjustment' ELSE 'manager_correction' END;
  v_old_origin := v_entry.origin;
  v_reason_full := 'Regularizacao de ponto aberto (' || v_code || ')' || COALESCE(': ' || v_text, '');

  UPDATE public.time_entries SET
    ended_at = _ended_at,
    effective_minutes = v_eff,
    origin = v_origin,
    last_edited_by = v_uid,
    last_edited_at = now(),
    last_edit_reason = v_reason_full,
    updated_at = now()
  WHERE id = v_entry.id;

  INSERT INTO public.time_entries_audit (time_entry_id, company_id, action, changed_by, reason, changes)
  VALUES (
    _time_entry_id, v_entry.company_id, 'update', v_uid, v_reason_full,
    jsonb_build_object(
      'ended_at', jsonb_build_object('old', NULL, 'new', _ended_at),
      'effective_minutes', jsonb_build_object('old', v_entry.effective_minutes, 'new', v_eff),
      'origin', jsonb_build_object('old', v_old_origin, 'new', v_origin),
      'recovery', jsonb_build_object(
        'source', CASE WHEN v_actor_role = 'employee' THEN 'employee_self_regularization' ELSE 'manager_regularization' END,
        'actor_user_id', v_uid,
        'actor_role', v_actor_role,
        'employee_user_id', v_entry.user_id,
        'task_id', v_entry.task_id,
        'original_started_at', v_entry.started_at,
        'informed_ended_at', _ended_at,
        'reason_code', v_code,
        'reason_text', v_text
      )
    )
  );

  IF _complete_task AND v_entry.task_id IS NOT NULL THEN
    UPDATE public.tasks
       SET status = 'concluido', completed_at = COALESCE(completed_at, _ended_at), updated_at = now()
     WHERE id = v_entry.task_id AND status = 'em_andamento';
  END IF;

  SELECT title INTO v_task_title FROM public.tasks WHERE id = v_entry.task_id;
  SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = v_entry.user_id;
  SELECT full_name INTO v_manager_name FROM public.profiles WHERE id = v_uid;

  IF v_actor_role = 'manager' AND v_entry.user_id <> v_uid THEN
    PERFORM public._notify(
      v_entry.company_id, v_entry.user_id, v_entry.task_id, 'punch_regularized',
      'Ponto regularizado pelo gestor',
      'Seu ponto da tarefa ' || COALESCE(v_task_title, 'sem titulo') || ' foi regularizado por ' || COALESCE(v_manager_name, 'gestor') ||
      '. Entrada: ' || to_char(v_entry.started_at, 'DD/MM HH24:MI') || ' · Saida: ' || to_char(_ended_at, 'DD/MM HH24:MI') ||
      ' · Motivo: ' || v_code || COALESCE(' (' || v_text || ')', ''),
      'media',
      jsonb_build_object('time_entry_id', _time_entry_id, 'reason_code', v_code, 'link', '/app/ponto')
    );
  ELSE
    FOR m IN
      SELECT ur.user_id FROM public.user_roles ur
       WHERE ur.company_id = v_entry.company_id AND ur.role IN ('manager','owner')
    LOOP
      PERFORM public._notify(
        v_entry.company_id, m.user_id, v_entry.task_id, 'punch_regularized',
        'Ponto regularizado pelo funcionario',
        COALESCE(v_employee_name, 'Funcionario') || ' regularizou o ponto da tarefa ' || COALESCE(v_task_title, 'sem titulo') ||
        '. Saida informada: ' || to_char(_ended_at, 'DD/MM HH24:MI') || ' · Motivo: ' || v_code,
        'baixa',
        jsonb_build_object('time_entry_id', _time_entry_id, 'reason_code', v_code, 'link', '/app/ponto/gestao')
      );
    END LOOP;
  END IF;

  SELECT * INTO v_entry FROM public.time_entries WHERE id = _time_entry_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'PUNCH_RECOVERED',
    'message', 'Ponto regularizado com sucesso.',
    'data', jsonb_build_object(
      'time_entry_id', v_entry.id,
      'started_at', v_entry.started_at,
      'ended_at', v_entry.ended_at,
      'effective_minutes', v_entry.effective_minutes
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.punch_recover_open_entry(uuid, timestamptz, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.punch_recover_open_entry(uuid, timestamptz, text, text, boolean) TO authenticated;