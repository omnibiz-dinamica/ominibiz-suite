ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'punch_adjusted';

-- SUP-253: aviso ao colaborador quando outra pessoa ajusta o seu ponto.
-- Dispara a partir da auditoria (1 linha por salvamento) => 1 aviso por salvamento.
CREATE OR REPLACE FUNCTION public.time_entries_audit_notify_employee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.time_entries%ROWTYPE;
  c jsonb := COALESCE(NEW.changes, '{}'::jsonb);
  v_old_start timestamptz; v_old_end timestamptz; v_new_start timestamptz; v_new_end timestamptz;
  v_date text; v_body text; v_action text;
  f text := 'HH24:MI';
BEGIN
  -- Regularizações de ponto aberto já notificam (punch_regularized).
  IF c ? 'recovery' THEN RETURN NEW; END IF;
  SELECT * INTO e FROM public.time_entries WHERE id = NEW.time_entry_id;
  IF NOT FOUND OR NEW.changed_by IS NULL OR NEW.changed_by = e.user_id OR e.company_id <> NEW.company_id THEN
    RETURN NEW;
  END IF;
  v_old_start := CASE WHEN c->'started_at' ? 'old' THEN NULLIF(c->'started_at'->>'old','')::timestamptz ELSE e.started_at END;
  v_new_start := CASE WHEN c->'started_at' ? 'new' THEN NULLIF(c->'started_at'->>'new','')::timestamptz ELSE e.started_at END;
  v_old_end   := CASE WHEN c->'ended_at' ? 'old' THEN NULLIF(c->'ended_at'->>'old','')::timestamptz ELSE e.ended_at END;
  v_new_end   := CASE WHEN c->'ended_at' ? 'new' THEN NULLIF(c->'ended_at'->>'new','')::timestamptz ELSE e.ended_at END;
  IF NEW.action IN ('create','regularize') THEN v_old_start := NULL; v_old_end := NULL; END IF;
  v_date := to_char(COALESCE(v_new_start, v_old_start, e.started_at) AT TIME ZONE 'UTC', 'DD/MM/YYYY');
  v_action := CASE NEW.action WHEN 'create' THEN 'criou' WHEN 'regularize' THEN 'registou' WHEN 'update' THEN 'alterou' ELSE 'removeu/anulou' END;
  IF e.voided_at IS NOT NULL AND NEW.action NOT IN ('create','regularize') THEN v_action := 'removeu/anulou'; END IF;
  v_body := format('Dia %s. Antes: %s → %s. Agora: %s → %s.', v_date,
    COALESCE(to_char(v_old_start AT TIME ZONE 'UTC', f), '—'), COALESCE(to_char(v_old_end AT TIME ZONE 'UTC', f), '—'),
    CASE WHEN e.voided_at IS NOT NULL THEN 'anulado' ELSE COALESCE(to_char(v_new_start AT TIME ZONE 'UTC', f), '—') END,
    CASE WHEN e.voided_at IS NOT NULL THEN '' ELSE COALESCE(to_char(v_new_end AT TIME ZONE 'UTC', f), '—') END);
  PERFORM public._notify(
    e.company_id, e.user_id, e.task_id, 'punch_adjusted'::public.notification_event,
    'O seu ponto foi ajustado pela gestão (' || v_action || ')', v_body, 'media'::public.notification_priority,
    jsonb_build_object('link', '/app/ponto', 'time_entry_id', e.id, 'audit_id', NEW.id, 'action', NEW.action,
      'changed_by', NEW.changed_by, 'reason', NEW.reason)
  );
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'punch_adjusted notify failed: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_time_entries_audit_notify_employee ON public.time_entries_audit;
CREATE TRIGGER trg_time_entries_audit_notify_employee
AFTER INSERT ON public.time_entries_audit
FOR EACH ROW EXECUTE FUNCTION public.time_entries_audit_notify_employee();

-- SUP-66 / SUP-224: edição atómica de uma ocorrência de grupo (nunca a série).
CREATE OR REPLACE FUNCTION public.task_group_edit_occurrence(
  _task_id uuid, _payload jsonb, _assignees uuid[], _apply_schedule_to_group boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  t public.tasks%ROWTYPE;
  v_group uuid; v_role text;
  v_desired uuid[]; v_current uuid[]; v_removed uuid[]; v_added uuid[];
  r record; v_new uuid; v_i int := 1;
  n_reassigned int := 0; n_cancelled int := 0; n_added int := 0; n_synced int := 0;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;
  IF v_uid IS NULL OR NOT (public.is_company_manager(v_uid, t.company_id) OR public.is_company_owner(v_uid, t.company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta tarefa' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(DISTINCT a) INTO v_desired FROM unnest(_assignees) a WHERE a IS NOT NULL;
  IF v_desired IS NULL OR array_length(v_desired,1) = 0 THEN RAISE EXCEPTION 'Selecione pelo menos um funcionário'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_desired) a WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = a AND ur.company_id = t.company_id)) THEN
    RAISE EXCEPTION 'Funcionário fora da empresa';
  END IF;
  v_role := COALESCE(public._activity_role(v_uid, t.company_id)::text, 'manager');
  v_group := t.task_group_id;

  CREATE TEMP TABLE IF NOT EXISTS _grp(id uuid, assigned_to uuid, status public.task_status, started boolean) ON COMMIT DROP;
  TRUNCATE _grp;
  INSERT INTO _grp
  SELECT x.id, x.assigned_to, x.status,
         (x.status NOT IN ('pendente','autorizado') OR EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = x.id AND te.voided_at IS NULL))
    FROM public.tasks x
   WHERE x.company_id = t.company_id AND x.deleted_at IS NULL AND x.archived_at IS NULL AND x.status <> 'cancelado'
     AND (x.id = t.id OR (v_group IS NOT NULL AND x.task_group_id = v_group
          AND x.recurrence_date IS NOT DISTINCT FROM t.recurrence_date));

  -- 1) Campos da tarefa clicada (assigned_to tratado abaixo).
  UPDATE public.tasks SET
    title = COALESCE(_payload->>'title', title),
    description = CASE WHEN _payload ? 'description' THEN _payload->>'description' ELSE description END,
    client_id = CASE WHEN _payload ? 'client_id' THEN NULLIF(_payload->>'client_id','')::uuid ELSE client_id END,
    priority = COALESCE((_payload->>'priority')::public.task_priority, priority),
    scheduled_for = CASE WHEN _payload ? 'scheduled_for' THEN NULLIF(_payload->>'scheduled_for','')::timestamptz ELSE scheduled_for END,
    scheduled_end = CASE WHEN _payload ? 'scheduled_end' THEN NULLIF(_payload->>'scheduled_end','')::timestamptz ELSE scheduled_end END,
    due_at = CASE WHEN _payload ? 'due_at' THEN NULLIF(_payload->>'due_at','')::timestamptz ELSE due_at END,
    recurrence_date = CASE WHEN _payload ? 'recurrence_date' AND recurrence_id IS NULL THEN NULLIF(_payload->>'recurrence_date','')::date ELSE recurrence_date END,
    absence_grace_minutes = COALESCE((_payload->>'absence_grace_minutes')::int, absence_grace_minutes),
    punch_mode_override = CASE WHEN _payload ? 'punch_mode_override' THEN NULLIF(_payload->>'punch_mode_override','')::public.punch_mode ELSE punch_mode_override END,
    schedule_name = CASE WHEN _payload ? 'schedule_name' THEN _payload->>'schedule_name' ELSE schedule_name END
  WHERE id = t.id;

  -- 2) Responsáveis.
  SELECT array_agg(DISTINCT assigned_to) INTO v_current FROM _grp;
  SELECT array_agg(a) INTO v_removed FROM unnest(v_current) a WHERE NOT (a = ANY(v_desired));
  SELECT array_agg(a) INTO v_added FROM unnest(v_desired) a WHERE NOT (a = ANY(COALESCE(v_current,'{}')));

  IF EXISTS (SELECT 1 FROM _grp g WHERE g.assigned_to = ANY(COALESCE(v_removed,'{}')) AND g.started) THEN
    RAISE EXCEPTION 'Não é possível remover um colaborador que já iniciou ou registou ponto nesta ocorrência';
  END IF;

  FOR r IN SELECT g.* FROM _grp g WHERE g.assigned_to = ANY(COALESCE(v_removed,'{}')) ORDER BY (g.id = t.id) DESC LOOP
    IF v_added IS NOT NULL AND v_i <= array_length(v_added,1) THEN
      UPDATE public.tasks SET assigned_to = v_added[v_i] WHERE id = r.id;
      INSERT INTO public.task_audit_events(company_id, task_id, actor_user_id, actor_role, event, previous_status, new_status, reason, recurrence_id, occurrence_date, action_scope)
      VALUES (t.company_id, r.id, v_uid, v_role, 'group_assignee_replaced', r.status, r.status,
              format('%s → %s', r.assigned_to, v_added[v_i]), t.recurrence_id, t.recurrence_date, 'occurrence');
      v_i := v_i + 1; n_reassigned := n_reassigned + 1;
    ELSE
      UPDATE public.tasks SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid,
             cancellation_reason = 'Removido do grupo pelo gestor' WHERE id = r.id;
      INSERT INTO public.task_audit_events(company_id, task_id, actor_user_id, actor_role, event, previous_status, new_status, reason, recurrence_id, occurrence_date, action_scope)
      VALUES (t.company_id, r.id, v_uid, v_role, 'group_assignee_removed', r.status, 'cancelado', 'Removido do grupo pelo gestor', t.recurrence_id, t.recurrence_date, 'occurrence');
      n_cancelled := n_cancelled + 1;
    END IF;
  END LOOP;

  IF v_added IS NOT NULL AND v_i <= array_length(v_added,1) THEN
    IF v_group IS NULL THEN
      v_group := gen_random_uuid();
      UPDATE public.tasks SET task_group_id = v_group WHERE id = t.id;
    END IF;
    SELECT * INTO t FROM public.tasks WHERE id = t.id;
    FOR v_i IN v_i..array_length(v_added,1) LOOP
      INSERT INTO public.tasks(company_id, title, description, priority, assigned_to, created_by, client_id,
        scheduled_for, scheduled_end, due_at, recurrence_date, absence_grace_minutes, punch_mode_override,
        schedule_name, task_group_id, status)
      VALUES (t.company_id, t.title, t.description, t.priority, v_added[v_i], v_uid, t.client_id,
        t.scheduled_for, t.scheduled_end, t.due_at, t.recurrence_date, t.absence_grace_minutes, t.punch_mode_override,
        t.schedule_name, v_group, 'pendente')
      RETURNING id INTO v_new;
      INSERT INTO public.task_audit_events(company_id, task_id, actor_user_id, actor_role, event, new_status, reason, recurrence_id, occurrence_date, action_scope)
      VALUES (t.company_id, v_new, v_uid, v_role, 'group_assignee_added', 'pendente', 'Adicionado ao grupo pelo gestor', t.recurrence_id, t.recurrence_date, 'occurrence');
      n_added := n_added + 1;
    END LOOP;
  END IF;

  -- 3) SUP-224: horário aos colegas da mesma ocorrência (pendentes/autorizadas, sem ponto).
  IF _apply_schedule_to_group THEN
    SELECT * INTO t FROM public.tasks WHERE id = t.id;
    FOR r IN SELECT g.* FROM _grp g JOIN public.tasks x ON x.id = g.id
              WHERE g.id <> t.id AND NOT g.started AND x.status IN ('pendente','autorizado')
                AND (x.scheduled_for IS DISTINCT FROM t.scheduled_for OR x.scheduled_end IS DISTINCT FROM t.scheduled_end) LOOP
      UPDATE public.tasks SET scheduled_for = t.scheduled_for, scheduled_end = t.scheduled_end, due_at = t.due_at WHERE id = r.id;
      INSERT INTO public.task_audit_events(company_id, task_id, actor_user_id, actor_role, event, previous_status, new_status, reason, recurrence_id, occurrence_date, action_scope)
      VALUES (t.company_id, r.id, v_uid, v_role, 'group_schedule_synced', r.status, r.status,
              'Horário aplicado a partir da tarefa ' || t.id, t.recurrence_id, t.recurrence_date, 'occurrence');
      n_synced := n_synced + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('reassigned', n_reassigned, 'cancelled', n_cancelled, 'added', n_added, 'schedule_synced', n_synced, 'task_group_id', v_group);
END $$;

REVOKE ALL ON FUNCTION public.task_group_edit_occurrence(uuid, jsonb, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_group_edit_occurrence(uuid, jsonb, uuid[], boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.time_entries_audit_notify_employee() FROM PUBLIC, anon, authenticated;