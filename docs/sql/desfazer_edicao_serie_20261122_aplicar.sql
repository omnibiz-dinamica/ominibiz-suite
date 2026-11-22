-- =====================================================================
-- OmniBiz · 22/11/2026 — "Desfazer" a edição de uma série (24 horas)
-- Desfazer este script: desfazer_edicao_serie_20261122_desfazer.sql
--
--   • Nova tabela recurrence_edit_undo: em cada edição de série guarda como
--     estavam a série e as ocorrências alteradas/apagadas (cópia completa).
--   • recurrence_update: IGUAL à atual (mesmas regras, mesmo retorno) e
--     passa também a gravar essa cópia antes de alterar/apagar.
--   • recurrence_edit_undo_apply(_id): só gestão da empresa, até 24 h,
--     uma única vez. Repõe a série, as ocorrências alteradas e as apagadas
--     (mesmo id). Recusa se a série foi alterada depois ou se alguma
--     ocorrência já foi iniciada / tem ponto. Fica no Histórico.
-- Não altera dados existentes.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.recurrence_edit_undo') IS NOT NULL
     OR to_regprocedure('public.recurrence_edit_undo_apply(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.recurrence_update(uuid,jsonb,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'PARAR: recurrence_update(uuid,jsonb,text,uuid) não existe. Nada foi alterado.';
  END IF;
END
$guard$;

-- Cópia de segurança da função atual (para o script de desfazer).
CREATE TABLE IF NOT EXISTS public._omnibiz_fn_backup_20261122_undo AS
SELECT 'recurrence_update(uuid,jsonb,text,uuid)'::text AS fn,
       pg_get_functiondef('public.recurrence_update(uuid,jsonb,text,uuid)'::regprocedure) AS def,
       now() AS saved_at;
ALTER TABLE public._omnibiz_fn_backup_20261122_undo ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.recurrence_edit_undo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recurrence_id uuid NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  recurrence_before jsonb NOT NULL,
  recurrence_after_updated_at timestamptz,
  tasks_updated jsonb NOT NULL DEFAULT '[]'::jsonb,
  tasks_deleted jsonb NOT NULL DEFAULT '[]'::jsonb,
  undone_at timestamptz,
  undone_by uuid
);
CREATE INDEX idx_recurrence_edit_undo_company_recent
  ON public.recurrence_edit_undo (company_id, created_at DESC);
ALTER TABLE public.recurrence_edit_undo ENABLE ROW LEVEL SECURITY;
-- Só leitura para a gestão da empresa; escrita apenas pelas funções abaixo.
CREATE POLICY recurrence_edit_undo_select_managers ON public.recurrence_edit_undo
  FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id));
REVOKE ALL ON public.recurrence_edit_undo FROM anon;
GRANT SELECT ON public.recurrence_edit_undo TO authenticated;

-- recurrence_update: corpo atual + gravação da cópia (marcado "UNDO").
CREATE OR REPLACE FUNCTION public.recurrence_update(_id uuid, _payload jsonb, _scope text DEFAULT 'all'::text, _from_task uuid DEFAULT NULL::uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.task_recurrences%ROWTYPE;
  v_cutoff_date date;
  v_count int := 0;
  v_new_time time;
  v_new_dur int;
  v_new_start date;
  v_new_end date;
  v_has_time bool := _payload ? 'scheduled_time';
  v_has_dur bool := _payload ? 'duration_minutes';
  v_upd jsonb; -- UNDO
  v_del jsonb; -- UNDO
BEGIN
  SELECT * INTO v_rec FROM public.task_recurrences WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recorrencia nao encontrada'; END IF;
  IF NOT public.is_company_manager(v_uid, v_rec.company_id) THEN RAISE EXCEPTION 'Apenas gestor pode editar'; END IF;
  IF _scope NOT IN ('future','all') THEN RAISE EXCEPTION 'Escopo invalido para template: %', _scope; END IF;
  v_new_start := COALESCE(NULLIF(_payload->>'start_date','')::date, v_rec.start_date);
  v_new_end := CASE WHEN _payload ? 'end_date' THEN NULLIF(_payload->>'end_date','')::date ELSE v_rec.end_date END;
  IF v_new_end IS NOT NULL AND v_new_end < v_new_start THEN
    RAISE EXCEPTION 'Data final da recorrencia nao pode ser anterior a data inicial';
  END IF;

  -- Data de corte (mesma regra de antes; só calculada mais cedo).
  IF _scope = 'future' THEN
    IF _from_task IS NOT NULL THEN
      SELECT COALESCE(recurrence_date, CURRENT_DATE) INTO v_cutoff_date FROM public.tasks WHERE id = _from_task;
    ELSE
      v_cutoff_date := CURRENT_DATE;
    END IF;
  ELSE
    v_cutoff_date := '-infinity'::date;
  END IF;

  -- UNDO: cópia, ANTES de qualquer alteração, das ocorrências que vão mudar e das que vão ser apagadas.
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_upd
  FROM public.tasks t
  WHERE t.recurrence_id = _id AND t.status IN ('pendente','autorizado')
    AND COALESCE(t.recurrence_date, CURRENT_DATE) >= v_cutoff_date;
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_del
  FROM public.tasks t
  WHERE t.recurrence_id = _id AND t.status IN ('pendente','autorizado')
    AND t.recurrence_date IS NOT NULL AND t.recurrence_date >= CURRENT_DATE
    AND (t.recurrence_date < v_new_start OR (v_new_end IS NOT NULL AND t.recurrence_date > v_new_end))
    AND NOT EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id);

  UPDATE public.task_recurrences SET
    title = COALESCE(_payload->>'title', title),
    description = CASE WHEN _payload ? 'description' THEN _payload->>'description' ELSE description END,
    assigned_to = CASE WHEN _payload ? 'assigned_to' THEN NULLIF(_payload->>'assigned_to','')::uuid ELSE assigned_to END,
    priority = COALESCE(_payload->>'priority', priority),
    location = CASE WHEN _payload ? 'location' THEN _payload->>'location' ELSE location END,
    absence_grace_minutes = COALESCE((_payload->>'absence_grace_minutes')::int, absence_grace_minutes),
    punch_mode_override = CASE WHEN _payload ? 'punch_mode_override' THEN NULLIF(_payload->>'punch_mode_override','')::punch_mode ELSE punch_mode_override END,
    scheduled_time = CASE WHEN v_has_time THEN NULLIF(_payload->>'scheduled_time','')::time ELSE scheduled_time END,
    duration_minutes = COALESCE((_payload->>'duration_minutes')::int, duration_minutes),
    start_date = v_new_start,
    end_date = v_new_end,
    updated_at = now()
  WHERE id = _id
  RETURNING scheduled_time, duration_minutes INTO v_new_time, v_new_dur;

  UPDATE public.tasks t SET
    title = COALESCE(_payload->>'title', t.title),
    description = CASE WHEN _payload ? 'description' THEN _payload->>'description' ELSE t.description END,
    assigned_to = CASE WHEN _payload ? 'assigned_to' THEN NULLIF(_payload->>'assigned_to','')::uuid ELSE t.assigned_to END,
    priority = COALESCE((_payload->>'priority')::task_priority, t.priority),
    location = CASE WHEN _payload ? 'location' THEN _payload->>'location' ELSE t.location END,
    absence_grace_minutes = COALESCE((_payload->>'absence_grace_minutes')::int, t.absence_grace_minutes),
    punch_mode_override = CASE WHEN _payload ? 'punch_mode_override' THEN NULLIF(_payload->>'punch_mode_override','')::punch_mode ELSE t.punch_mode_override END,
    scheduled_for = CASE
      WHEN v_has_time AND t.recurrence_date IS NOT NULL AND v_new_time IS NOT NULL THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz
      WHEN v_has_time AND v_new_time IS NULL THEN NULL
      ELSE t.scheduled_for END,
    scheduled_end = CASE
      WHEN (v_has_time OR v_has_dur) AND t.recurrence_date IS NOT NULL AND v_new_time IS NOT NULL AND COALESCE(v_new_dur, 0) > 0
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz + make_interval(mins => v_new_dur)
      WHEN v_has_time AND v_new_time IS NULL THEN NULL
      ELSE t.scheduled_end END,
    due_at = CASE
      WHEN (v_has_time OR v_has_dur) AND t.recurrence_date IS NOT NULL AND v_new_time IS NULL
        THEN (t.recurrence_date::timestamp + interval '1 day' - interval '1 second') AT TIME ZONE 'UTC'
      WHEN (v_has_time OR v_has_dur) AND t.recurrence_date IS NOT NULL AND v_new_time IS NOT NULL AND COALESCE(v_new_dur, 0) > 0
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz + make_interval(mins => v_new_dur)
      WHEN v_has_time AND t.recurrence_date IS NOT NULL AND v_new_time IS NOT NULL
        THEN (t.recurrence_date::text || ' ' || v_new_time::text)::timestamptz
      ELSE t.due_at END,
    updated_at = now()
  WHERE t.recurrence_id = _id AND t.status IN ('pendente','autorizado')
    AND COALESCE(t.recurrence_date, CURRENT_DATE) >= v_cutoff_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.tasks t
  WHERE t.recurrence_id = _id AND t.status IN ('pendente','autorizado')
    AND t.recurrence_date IS NOT NULL AND t.recurrence_date >= CURRENT_DATE
    AND (t.recurrence_date < v_new_start OR (v_new_end IS NOT NULL AND t.recurrence_date > v_new_end))
    AND NOT EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id);

  -- UNDO: grava a cópia (nunca impede a edição).
  BEGIN
    INSERT INTO public.recurrence_edit_undo
      (company_id, recurrence_id, actor_id, recurrence_before, recurrence_after_updated_at, tasks_updated, tasks_deleted)
    SELECT v_rec.company_id, _id, v_uid, to_jsonb(v_rec), r.updated_at, v_upd, v_del
    FROM public.task_recurrences r WHERE r.id = _id;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'recurrence_edit_undo não gravado para %: %', _id, SQLERRM;
  END;

  RETURN v_count;
END
$function$;

-- Desfazer uma edição de série (até 24 h, uma vez, só gestão).
CREATE FUNCTION public.recurrence_edit_undo_apply(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_uid uuid := auth.uid();
  u public.recurrence_edit_undo%ROWTYPE;
  b public.task_recurrences%ROWTYPE;
  v_now_upd timestamptz;
  v_blocked int;
  v_reverted int := 0;
  v_restored int := 0;
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO u FROM public.recurrence_edit_undo WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alteração não encontrada'; END IF;
  IF NOT public.is_company_manager(v_uid, u.company_id) THEN RAISE EXCEPTION 'Apenas a gestão pode desfazer'; END IF;
  IF u.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Esta alteração já foi desfeita'; END IF;
  IF u.expires_at < now() THEN RAISE EXCEPTION 'Já passaram 24 horas: esta alteração já não pode ser desfeita'; END IF;

  SELECT updated_at INTO v_now_upd FROM public.task_recurrences WHERE id = u.recurrence_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A série já não existe'; END IF;
  IF u.recurrence_after_updated_at IS NOT NULL AND v_now_upd IS DISTINCT FROM u.recurrence_after_updated_at THEN
    RAISE EXCEPTION 'A série foi alterada depois desta edição. Desfaça primeiro a alteração mais recente.';
  END IF;

  -- Ocorrências alteradas que entretanto foram iniciadas, concluídas ou têm ponto: não desfaz.
  SELECT count(*) INTO v_blocked
  FROM jsonb_array_elements(u.tasks_updated) x
  JOIN public.tasks t ON t.id = (x->>'id')::uuid
  WHERE t.status NOT IN ('pendente','autorizado')
     OR EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id);
  IF v_blocked > 0 THEN
    RAISE EXCEPTION '% tarefa(s) desta série já foram iniciadas ou têm ponto: não é possível desfazer.', v_blocked;
  END IF;

  b := jsonb_populate_record(NULL::public.task_recurrences, u.recurrence_before);
  -- O Histórico regista o "desfazer" abaixo; evita a linha automática duplicada.
  PERFORM set_config('activity.r' || md5(u.recurrence_id::text), 'on', true);
  UPDATE public.task_recurrences SET
    title = b.title, description = b.description, assigned_to = b.assigned_to, priority = b.priority,
    location = b.location, absence_grace_minutes = b.absence_grace_minutes,
    punch_mode_override = b.punch_mode_override, scheduled_time = b.scheduled_time,
    duration_minutes = b.duration_minutes, start_date = b.start_date, end_date = b.end_date,
    updated_at = now()
  WHERE id = u.recurrence_id;
  PERFORM set_config('activity.r' || md5(u.recurrence_id::text), '', true);

  -- Ocorrências alteradas voltam aos valores de antes.
  UPDATE public.tasks t SET
    title = o.title, description = o.description, assigned_to = o.assigned_to, priority = o.priority,
    location = o.location, absence_grace_minutes = o.absence_grace_minutes,
    punch_mode_override = o.punch_mode_override, scheduled_for = o.scheduled_for,
    scheduled_end = o.scheduled_end, due_at = o.due_at, updated_at = now()
  FROM (SELECT (jsonb_populate_record(NULL::public.tasks, x)).* FROM jsonb_array_elements(u.tasks_updated) x) o
  WHERE t.id = o.id;
  GET DIAGNOSTICS v_reverted = ROW_COUNT;

  -- Ocorrências apagadas voltam com o mesmo id (se já houver outra no mesmo dia, essa fica).
  WITH ins AS (
    INSERT INTO public.tasks
    SELECT (jsonb_populate_record(NULL::public.tasks, x)).* FROM jsonb_array_elements(u.tasks_deleted) x
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM ins;
  v_restored := COALESCE(array_length(v_ids, 1), 0);

  -- Repor não é uma tarefa nova: não envia avisos de "nova tarefa".
  IF v_restored > 0 THEN
    DELETE FROM public.notifications n
    WHERE n.created_at >= now()
      AND (n.task_id = ANY (v_ids)
           OR n.metadata->>'link' = ANY (SELECT '/app/tarefas?task=' || i::text FROM unnest(v_ids) i));
  END IF;

  UPDATE public.recurrence_edit_undo SET undone_at = now(), undone_by = v_uid WHERE id = _id;

  PERFORM public._activity_emit(u.company_id, v_uid, 'recurrence', u.recurrence_id, 'series_edit_undone', 'gestao',
    'Desfez a edição da recorrência "' || b.title || '" de ' || to_char(u.created_at AT TIME ZONE 'Europe/Brussels', 'DD/MM HH24:MI')
      || CASE WHEN v_restored > 0 THEN ' · repôs ' || v_restored || ' tarefa(s)' ELSE '' END,
    jsonb_strip_nulls(jsonb_build_object(
      'Data início', to_jsonb(b.start_date),
      'Data fim', to_jsonb(b.end_date),
      'Tarefas repostas', v_restored,
      'Tarefas revertidas', v_reverted)),
    'user');

  RETURN jsonb_build_object('restored', v_restored, 'reverted', v_reverted);
END
$f$;
REVOKE ALL ON FUNCTION public.recurrence_edit_undo_apply(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurrence_edit_undo_apply(uuid) TO authenticated;

COMMIT;

SELECT jsonb_build_object(
  'tabela', to_regclass('public.recurrence_edit_undo') IS NOT NULL,
  'funcao_desfazer', to_regprocedure('public.recurrence_edit_undo_apply(uuid)') IS NOT NULL,
  'recurrence_update_grava_copia', position('recurrence_edit_undo' in pg_get_functiondef('public.recurrence_update(uuid,jsonb,text,uuid)'::regprocedure)) > 0
)::text AS resultado;
