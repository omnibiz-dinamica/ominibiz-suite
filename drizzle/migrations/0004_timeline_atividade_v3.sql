-- Timeline de atividade — migração v3 (NÃO APLICADA)
SET LOCAL lock_timeout = '3s';

-- ---------- 1. Tabela de eventos append-only ----------
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid NULL,
  actor_role text NULL,
  actor_name text NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('task','recurrence','vacation')),
  entity_id uuid NOT NULL,
  action text NOT NULL,
  tab text NOT NULL CHECK (tab IN ('gestao','execucao')),
  summary text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','system','recurrence')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX activity_events_company_created_idx ON public.activity_events (company_id, created_at DESC, id DESC);
CREATE INDEX activity_events_company_tab_created_idx ON public.activity_events (company_id, tab, created_at DESC, id DESC);

REVOKE ALL ON public.activity_events FROM anon, authenticated;
GRANT SELECT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company managers read activity" ON public.activity_events
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = auth.uid() AND ur.company_id = activity_events.company_id
               AND ur.role IN ('manager','owner'))
);

CREATE OR REPLACE FUNCTION public.activity_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Única exceção: remoção em cascata de uma empresa já apagada.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Eventos de atividade não podem ser alterados nem apagados';
END $$;
CREATE TRIGGER activity_events_no_update BEFORE UPDATE OR DELETE ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.activity_events_immutable();
CREATE OR REPLACE FUNCTION public.activity_events_no_truncate()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Eventos de atividade não podem ser apagados'; END $$;
CREATE TRIGGER activity_events_no_truncate BEFORE TRUNCATE ON public.activity_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.activity_events_no_truncate();

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;

-- ---------- 2. Helpers (internos, sem acesso direto) ----------
CREATE OR REPLACE FUNCTION public._activity_name(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(trim(p.full_name),''), 'Utilizador') FROM public.profiles p WHERE p.id = _uid
$$;

CREATE OR REPLACE FUNCTION public._activity_role(_uid uuid, _company uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT ur.role::text FROM public.user_roles ur
      WHERE ur.user_id = _uid AND (ur.company_id = _company OR ur.role = 'super_admin')
      ORDER BY CASE ur.role::text WHEN 'super_admin' THEN 0 WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END
      LIMIT 1), 'unknown')
$$;

-- Timestamps gravados em ISO 8601 UTC; a interface formata.
CREATE OR REPLACE FUNCTION public._activity_iso(_ts timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _ts IS NULL THEN NULL
              ELSE to_char(_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END
$$;

CREATE OR REPLACE FUNCTION public._activity_emit(
  _company uuid, _actor uuid, _entity_type text, _entity_id uuid, _action text,
  _tab text, _summary text, _changes jsonb DEFAULT '{}'::jsonb, _source text DEFAULT 'user'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_events(company_id, actor_id, actor_role, actor_name, entity_type, entity_id,
                                     action, tab, summary, changes, source)
  VALUES (_company, _actor,
    CASE WHEN _actor IS NULL THEN 'system' ELSE public._activity_role(_actor, _company) END,
    CASE WHEN _actor IS NULL THEN 'Sistema' ELSE public._activity_name(_actor) END,
    _entity_type, _entity_id, _action, _tab, _summary, COALESCE(_changes, '{}'::jsonb), _source);
EXCEPTION WHEN others THEN
  RAISE WARNING '_activity_emit falhou: %', SQLERRM;
END $$;

REVOKE ALL ON FUNCTION public._activity_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._activity_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._activity_iso(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._activity_emit(uuid,uuid,text,uuid,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;

-- ---------- 3. Tarefas (gatilhos por instrução; lote = 1 evento agregado) ----------
CREATE OR REPLACE FUNCTION public.activity_tasks_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int; r record;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  BEGIN
    -- Ocorrências de série são cobertas pelo evento da série (invólucro de geração).
    SELECT count(*) INTO v_n FROM new_rows WHERE recurrence_id IS NULL;
    IF v_n = 0 THEN RETURN NULL; END IF;
    IF v_n = 1 THEN
      SELECT * INTO r FROM new_rows WHERE recurrence_id IS NULL;
      PERFORM public._activity_emit(r.company_id, v_uid, 'task', r.id, 'task_created', 'gestao',
        'Criou a tarefa "' || r.title || '"' || COALESCE(' para ' || public._activity_name(r.assigned_to), ''),
        jsonb_strip_nulls(jsonb_build_object(
          'Responsável', public._activity_name(r.assigned_to),
          'Cliente', (SELECT c.name FROM public.clients c WHERE c.id = r.client_id),
          'Início', public._activity_iso(r.scheduled_for),
          'Fim', public._activity_iso(r.scheduled_end))), 'user');
    ELSE
      FOR r IN
        SELECT company_id, count(*) AS n, (array_agg(id ORDER BY scheduled_for NULLS LAST))[1] AS first_id,
               (array_agg(title ORDER BY scheduled_for NULLS LAST))[1:10] AS titles
          FROM new_rows WHERE recurrence_id IS NULL GROUP BY company_id
      LOOP
        PERFORM public._activity_emit(r.company_id, v_uid, 'task', r.first_id, 'task_created_bulk', 'gestao',
          'Criou ' || r.n || ' tarefas', jsonb_build_object('Quantidade', r.n, 'Tarefas', to_jsonb(r.titles)), 'user');
      END LOOP;
    END IF;
  EXCEPTION WHEN others THEN RAISE WARNING 'activity_tasks_insert: %', SQLERRM; END;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.activity_tasks_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); g record;
BEGIN
  BEGIN
    FOR g IN
      WITH d AS (
        SELECT n.id, n.company_id, n.title, n.recurrence_id, n.scheduled_for AS sort_key,
          n.status AS ns, o.status AS os, n.assigned_to AS na, o.assigned_to AS oa,
          n.title AS nt, o.title AS ot, n.scheduled_for AS nsf, o.scheduled_for AS osf,
          n.scheduled_end AS nse, o.scheduled_end AS ose, n.client_id AS nc, o.client_id AS oc,
          n.priority AS np, o.priority AS op, n.description AS nd, o.description AS od,
          n.archived_at AS nar, o.archived_at AS oar, n.deleted_at AS ndel, o.deleted_at AS odel,
          n.refused_by AS nref, o.refused_by AS oref,
          n.refusal_reason, n.absence_reason, n.cancellation_reason
        FROM new_rows n JOIN old_rows o ON o.id = n.id
      ), a0 AS (
        SELECT d.*, CASE
          WHEN odel IS NULL AND ndel IS NOT NULL THEN 'task_deleted'
          WHEN oar IS NULL AND nar IS NOT NULL THEN 'task_archived'
          WHEN oar IS NOT NULL AND nar IS NULL THEN 'task_unarchived'
          WHEN oref IS NULL AND nref IS NOT NULL THEN 'task_refused'
          WHEN ns IS DISTINCT FROM os AND ns::text = 'em_andamento' THEN 'task_started'
          WHEN ns IS DISTINCT FROM os AND ns::text = 'concluido' THEN 'task_completed'
          WHEN ns IS DISTINCT FROM os AND ns::text = 'ausente' THEN 'task_absent'
          WHEN ns IS DISTINCT FROM os AND ns::text = 'cancelado' THEN 'task_cancelled'
          WHEN ns IS DISTINCT FROM os AND ns::text = 'autorizado' THEN 'task_authorized'
          WHEN na IS DISTINCT FROM oa THEN 'task_reassigned'
          WHEN nt IS DISTINCT FROM ot OR nsf IS DISTINCT FROM osf OR nse IS DISTINCT FROM ose
            OR nc IS DISTINCT FROM oc OR np IS DISTINCT FROM op OR nd IS DISTINCT FROM od THEN 'task_edited'
          WHEN ns IS DISTINCT FROM os THEN 'task_status_changed'
        END AS action FROM d
      ), a AS (
        SELECT a0.*,
          row_number() OVER (PARTITION BY a0.company_id, a0.action ORDER BY a0.sort_key NULLS LAST, a0.id) AS rn,
          count(*) OVER (PARTITION BY a0.company_id, a0.action) AS gn
          FROM a0 WHERE a0.action IS NOT NULL
      )
      SELECT a.company_id, a.action, count(*) AS n,
        (array_agg(a.id ORDER BY a.sort_key NULLS LAST))[1] AS first_id,
        (array_agg(a.title ORDER BY a.sort_key NULLS LAST))[1:10] AS titles,
        -- campos-chave da primeira linha (usados quando n = 1)
        (array_agg(jsonb_strip_nulls(jsonb_build_object(
          'Funcionário', CASE WHEN a.action IN ('task_started','task_completed','task_refused','task_absent') THEN public._activity_name(a.na) END,
          'Responsável', CASE WHEN a.na IS DISTINCT FROM a.oa THEN jsonb_build_object('de', public._activity_name(a.oa), 'para', public._activity_name(a.na)) END,
          'Título', CASE WHEN a.nt IS DISTINCT FROM a.ot THEN jsonb_build_object('de', a.ot, 'para', a.nt) END,
          'Início', CASE WHEN a.nsf IS DISTINCT FROM a.osf THEN jsonb_build_object('de', public._activity_iso(a.osf), 'para', public._activity_iso(a.nsf)) END,
          'Fim', CASE WHEN a.nse IS DISTINCT FROM a.ose THEN jsonb_build_object('de', public._activity_iso(a.ose), 'para', public._activity_iso(a.nse)) END,
          'Cliente', CASE WHEN a.nc IS DISTINCT FROM a.oc THEN jsonb_build_object(
              'de', (SELECT c.name FROM public.clients c WHERE c.id = a.oc),
              'para', (SELECT c.name FROM public.clients c WHERE c.id = a.nc)) END,
          'Prioridade', CASE WHEN a.np IS DISTINCT FROM a.op THEN jsonb_build_object('de', a.op::text, 'para', a.np::text) END,
          'Descrição', CASE WHEN a.nd IS DISTINCT FROM a.od THEN 'alterada' END,
          'Estado', CASE WHEN a.ns IS DISTINCT FROM a.os THEN jsonb_build_object('de', a.os::text, 'para', a.ns::text) END,
          'Motivo', CASE a.action WHEN 'task_refused' THEN a.refusal_reason WHEN 'task_absent' THEN a.absence_reason WHEN 'task_cancelled' THEN a.cancellation_reason END
        ))) FILTER (WHERE a.rn = 1 AND a.gn = 1))[1] AS changes,
        -- funcionários distintos (para lotes)
        (SELECT jsonb_agg(DISTINCT public._activity_name(x)) FROM unnest(array_agg(a.na)) x) AS employees,
        (array_agg(a.cancellation_reason) FILTER (WHERE a.cancellation_reason IS NOT NULL))[1] AS reason
      FROM a
      WHERE (v_uid IS NOT NULL OR a.action = 'task_absent')
      GROUP BY a.company_id, a.action
    LOOP
      PERFORM public._activity_emit(g.company_id, v_uid, 'task', g.first_id,
        CASE WHEN g.n > 1 THEN g.action || '_bulk' ELSE g.action END,
        CASE WHEN g.action IN ('task_started','task_completed','task_refused','task_absent') THEN 'execucao' ELSE 'gestao' END,
        CASE g.action
          WHEN 'task_deleted' THEN 'Excluiu '      WHEN 'task_archived' THEN 'Arquivou '
          WHEN 'task_unarchived' THEN 'Desarquivou ' WHEN 'task_refused' THEN 'Recusou '
          WHEN 'task_started' THEN 'Iniciou '      WHEN 'task_completed' THEN 'Concluiu '
          WHEN 'task_absent' THEN 'Marcou ausência ' WHEN 'task_cancelled' THEN 'Cancelou '
          WHEN 'task_authorized' THEN 'Autorizou '  WHEN 'task_reassigned' THEN 'Transferiu '
          WHEN 'task_edited' THEN 'Editou '        ELSE 'Alterou o estado ' END
        || CASE WHEN g.n > 1
             THEN CASE g.action WHEN 'task_absent' THEN 'em ' WHEN 'task_status_changed' THEN 'de ' ELSE '' END || g.n || ' tarefas'
             ELSE CASE g.action WHEN 'task_absent' THEN 'na' WHEN 'task_status_changed' THEN 'da' ELSE 'a' END || ' tarefa "' || g.titles[1] || '"' END,
        CASE WHEN g.n > 1
          THEN jsonb_strip_nulls(jsonb_build_object('Quantidade', g.n, 'Tarefas', to_jsonb(g.titles),
                 'Funcionários', g.employees, 'Motivo', g.reason))
          ELSE g.changes END,
        CASE WHEN v_uid IS NULL THEN 'system' ELSE 'user' END);
    END LOOP;
  EXCEPTION WHEN others THEN RAISE WARNING 'activity_tasks_update: %', SQLERRM; END;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.activity_tasks_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); g record;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  BEGIN
    FOR g IN
      SELECT o.company_id, count(*) AS n, (array_agg(o.id))[1] AS first_id,
             (array_agg(o.title))[1:10] AS titles, (array_agg(o.assigned_to))[1] AS emp,
             (array_agg(o.scheduled_for))[1] AS sf
        FROM old_rows o
       WHERE EXISTS (SELECT 1 FROM public.companies c WHERE c.id = o.company_id)
       GROUP BY o.company_id
    LOOP
      PERFORM public._activity_emit(g.company_id, v_uid, 'task', g.first_id,
        CASE WHEN g.n > 1 THEN 'task_deleted_bulk' ELSE 'task_deleted' END, 'gestao',
        CASE WHEN g.n > 1 THEN 'Excluiu ' || g.n || ' tarefas' ELSE 'Excluiu a tarefa "' || g.titles[1] || '"' END,
        CASE WHEN g.n > 1 THEN jsonb_build_object('Quantidade', g.n, 'Tarefas', to_jsonb(g.titles))
             ELSE jsonb_strip_nulls(jsonb_build_object('Responsável', public._activity_name(g.emp), 'Início', public._activity_iso(g.sf))) END,
        'user');
    END LOOP;
  EXCEPTION WHEN others THEN RAISE WARNING 'activity_tasks_delete: %', SQLERRM; END;
  RETURN NULL;
END $$;

CREATE TRIGGER activity_tasks_insert_trg AFTER INSERT ON public.tasks
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.activity_tasks_insert();
CREATE TRIGGER activity_tasks_update_trg AFTER UPDATE ON public.tasks
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.activity_tasks_update();
CREATE TRIGGER activity_tasks_delete_trg AFTER DELETE ON public.tasks
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.activity_tasks_delete();

-- ---------- 4. Recorrências ----------
-- Edição/encerramento por pessoa: UM evento no fim da transação, com N gerado na mesma transação.
CREATE OR REPLACE FUNCTION public.activity_recurrence_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_flag text := 'activity.r' || md5(NEW.id::text);
  v_n int; v_action text; v_changes jsonb; v_label text;
BEGIN
  BEGIN
    IF v_uid IS NULL OR COALESCE(current_setting(v_flag, true), '') = 'on' THEN RETURN NULL; END IF;
    v_changes := jsonb_strip_nulls(jsonb_build_object(
      'Responsável', CASE WHEN NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN jsonb_build_object('de', public._activity_name(OLD.assigned_to), 'para', public._activity_name(NEW.assigned_to)) END,
      'Título', CASE WHEN NEW.title IS DISTINCT FROM OLD.title THEN jsonb_build_object('de', OLD.title, 'para', NEW.title) END,
      'Hora', CASE WHEN NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN jsonb_build_object('de', OLD.scheduled_time::text, 'para', NEW.scheduled_time::text) END,
      'Duração (min)', CASE WHEN NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN jsonb_build_object('de', OLD.duration_minutes, 'para', NEW.duration_minutes) END,
      'Frequência', CASE WHEN NEW.frequency IS DISTINCT FROM OLD.frequency THEN jsonb_build_object('de', OLD.frequency::text, 'para', NEW.frequency::text) END,
      'Dias da semana', CASE WHEN NEW.weekdays IS DISTINCT FROM OLD.weekdays THEN jsonb_build_object('de', to_jsonb(OLD.weekdays), 'para', to_jsonb(NEW.weekdays)) END,
      'Data início', CASE WHEN NEW.start_date IS DISTINCT FROM OLD.start_date THEN jsonb_build_object('de', OLD.start_date, 'para', NEW.start_date) END,
      'Data fim', CASE WHEN NEW.end_date IS DISTINCT FROM OLD.end_date THEN jsonb_build_object('de', OLD.end_date, 'para', NEW.end_date) END,
      'Cliente', CASE WHEN NEW.client_id IS DISTINCT FROM OLD.client_id THEN jsonb_build_object(
          'de', (SELECT c.name FROM public.clients c WHERE c.id = OLD.client_id),
          'para', (SELECT c.name FROM public.clients c WHERE c.id = NEW.client_id)) END,
      'Programação', CASE WHEN NEW.schedule_name IS DISTINCT FROM OLD.schedule_name THEN jsonb_build_object('de', OLD.schedule_name, 'para', NEW.schedule_name) END,
      'Estado', CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN jsonb_build_object('de', OLD.status::text, 'para', NEW.status::text) END
    ));
    IF v_changes = '{}'::jsonb THEN RETURN NULL; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.ended_reason IS NOT NULL THEN
      v_changes := v_changes || jsonb_build_object('Motivo', NEW.ended_reason);
    END IF;
    PERFORM set_config(v_flag, 'on', true);

    SELECT count(*) INTO v_n FROM public.tasks t WHERE t.recurrence_id = NEW.id AND t.created_at = now();
    v_action := CASE WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text = 'ended' THEN 'series_ended'
                     WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text = 'paused' THEN 'series_paused'
                     WHEN NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN 'series_reassigned'
                     ELSE 'series_edited' END;
    v_label := COALESCE(NULLIF(NEW.title,''), NEW.schedule_name, 'série');
    IF v_n > 0 THEN v_changes := v_changes || jsonb_build_object('Ocorrências geradas', v_n); END IF;
    PERFORM public._activity_emit(NEW.company_id, v_uid, 'recurrence', NEW.id, v_action, 'gestao',
      CASE v_action WHEN 'series_ended' THEN 'Encerrou a recorrência "' WHEN 'series_paused' THEN 'Pausou a recorrência "'
        WHEN 'series_reassigned' THEN 'Transferiu a recorrência "' ELSE 'Editou a recorrência "' END
        || v_label || '"' || CASE WHEN v_n > 0 THEN ' · gerou ' || v_n || ' ocorrências' ELSE '' END,
      v_changes, 'user');
  EXCEPTION WHEN others THEN RAISE WARNING 'activity_recurrence_changed: %', SQLERRM; END;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER activity_recurrence_changed_trg
  AFTER UPDATE ON public.task_recurrences
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.activity_recurrence_changed();

-- Geração: o original (SECURITY DEFINER, verificado) passa a _core; o invólucro mantém
-- nome, assinatura e modo, e grava UM evento por série quando N > 0.
ALTER FUNCTION public.recurrence_materialize(integer, uuid, uuid) RENAME TO recurrence_materialize_core;
REVOKE ALL ON FUNCTION public.recurrence_materialize_core(integer, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recurrence_materialize(
  _days_ahead integer DEFAULT 60, _company_id uuid DEFAULT NULL::uuid, _recurrence_id uuid DEFAULT NULL::uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int; v_uid uuid := auth.uid(); r public.task_recurrences%ROWTYPE; v_created boolean;
BEGIN
  v_n := public.recurrence_materialize_core(_days_ahead, _company_id, _recurrence_id);
  IF v_n > 0 AND v_uid IS NOT NULL AND _recurrence_id IS NOT NULL
     AND COALESCE(current_setting('activity.silent', true), '') <> 'on' THEN
    BEGIN
      SELECT * INTO r FROM public.task_recurrences WHERE id = _recurrence_id;
      IF FOUND THEN
        v_created := r.created_at > now() - interval '30 minutes'
          AND NOT EXISTS (SELECT 1 FROM public.activity_events e
                          WHERE e.entity_type = 'recurrence' AND e.entity_id = r.id AND e.action = 'series_created');
        PERFORM public._activity_emit(r.company_id, v_uid, 'recurrence', r.id,
          CASE WHEN v_created THEN 'series_created' ELSE 'series_generated' END, 'gestao',
          CASE WHEN v_created THEN 'Criou a recorrência "' ELSE 'Gerou ocorrências da recorrência "' END
            || COALESCE(NULLIF(r.title,''), r.schedule_name, 'série') || '" · gerou ' || v_n || ' ocorrências',
          jsonb_strip_nulls(jsonb_build_object(
            'Responsável', public._activity_name(r.assigned_to),
            'Cliente', (SELECT c.name FROM public.clients c WHERE c.id = r.client_id),
            'Frequência', r.frequency::text,
            'Data início', r.start_date, 'Data fim', r.end_date,
            'Ocorrências geradas', v_n)),
          'recurrence');
      END IF;
    EXCEPTION WHEN others THEN RAISE WARNING 'recurrence_materialize evento: %', SQLERRM; END;
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.recurrence_materialize(integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurrence_materialize(integer, uuid, uuid) TO authenticated, service_role;

-- Extensão diária: sucesso = nenhum evento; falha = UM evento de erro por série.
CREATE OR REPLACE FUNCTION public.recurrence_extend_horizon(_limit integer DEFAULT 200, _days_ahead integer DEFAULT 365)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_company uuid; v_title text; v_total int := 0;
BEGIN
  PERFORM set_config('activity.silent', 'on', true);
  FOR v_id, v_company, v_title IN
    SELECT r.id, r.company_id, COALESCE(NULLIF(r.title,''), r.schedule_name, 'série')
      FROM public.task_recurrences r
     WHERE r.status = 'active' AND r.assigned_to IS NOT NULL
       AND (r.end_date IS NULL OR r.end_date >= CURRENT_DATE)
     ORDER BY COALESCE((SELECT max(t.recurrence_date) FROM public.tasks t
                         WHERE t.recurrence_id = r.id AND t.deleted_at IS NULL), CURRENT_DATE - 1) ASC,
              r.created_at ASC
     LIMIT GREATEST(1, _limit)
  LOOP
    BEGIN
      v_total := v_total + public.recurrence_materialize(_days_ahead, NULL, v_id);
    EXCEPTION WHEN others THEN
      PERFORM public._activity_emit(v_company, NULL, 'recurrence', v_id, 'series_extend_failed', 'gestao',
        'Falha na extensão automática da recorrência "' || v_title || '"',
        jsonb_build_object('Motivo', SQLERRM), 'recurrence');
    END;
  END LOOP;
  PERFORM set_config('activity.silent', 'off', true);
  RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.recurrence_extend_horizon(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recurrence_extend_horizon(integer, integer) TO service_role;

-- ---------- 5. Férias ----------
CREATE OR REPLACE FUNCTION public.activity_vacation_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid;
BEGIN
  BEGIN
    v_actor := COALESCE(auth.uid(), NEW.created_by, NEW.user_id);
    PERFORM public._activity_emit(NEW.company_id, v_actor, 'vacation', NEW.id, 'vacation_requested', 'gestao',
      CASE WHEN v_actor = NEW.user_id THEN 'Pediu férias' ELSE 'Registou férias para ' || public._activity_name(NEW.user_id) END
        || ': ' || to_char(NEW.start_date, 'DD/MM/YYYY') || ' → ' || to_char(NEW.end_date, 'DD/MM/YYYY'),
      jsonb_build_object('Funcionário', public._activity_name(NEW.user_id), 'Data início', NEW.start_date,
                         'Data fim', NEW.end_date, 'Estado', NEW.status::text), 'user');
  EXCEPTION WHEN others THEN RAISE WARNING 'activity_vacation_insert: %', SQLERRM; END;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.activity_vacation_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid;
BEGIN
  BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
    v_actor := COALESCE(auth.uid(), NEW.decided_by, NEW.cancelled_by, NEW.forwarded_by);
    PERFORM public._activity_emit(NEW.company_id, v_actor, 'vacation', NEW.id, 'vacation_' || NEW.status::text, 'gestao',
      CASE NEW.status::text
        WHEN 'aprovado' THEN 'Aprovou as férias de '  WHEN 'rejeitado' THEN 'Rejeitou as férias de '
        WHEN 'cancelado' THEN 'Cancelou as férias de ' WHEN 'aguardando_aprovacao' THEN 'Encaminhou para aprovação as férias de '
        WHEN 'pendente_confirmacao' THEN 'Pediu confirmação das férias de ' ELSE 'Alterou as férias de ' END
        || public._activity_name(NEW.user_id) || ' (' || to_char(NEW.start_date, 'DD/MM/YYYY') || ' → ' || to_char(NEW.end_date, 'DD/MM/YYYY') || ')',
      jsonb_strip_nulls(jsonb_build_object(
        'Estado', jsonb_build_object('de', OLD.status::text, 'para', NEW.status::text),
        'Motivo', COALESCE(NEW.decision_reason, NEW.cancellation_reason))),
      CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END);
  EXCEPTION WHEN others THEN RAISE WARNING 'activity_vacation_update: %', SQLERRM; END;
  RETURN NULL;
END $$;

CREATE TRIGGER activity_vacation_insert_trg AFTER INSERT ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.activity_vacation_insert();
CREATE TRIGGER activity_vacation_update_trg AFTER UPDATE OF status ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.activity_vacation_update();

-- ---------- 6. Mecanismo único de posse (fila de férias generalizada) ----------
ALTER TABLE public.vacation_manager_queue
  ADD COLUMN entity_type text NOT NULL DEFAULT 'vacation' CHECK (entity_type IN ('task','recurrence','vacation')),
  ADD COLUMN entity_id uuid NULL,
  ADD COLUMN kind text NOT NULL DEFAULT 'queue' CHECK (kind IN ('queue','reservation')),
  ADD COLUMN expires_at timestamptz NULL,
  ADD COLUMN last_activity_at timestamptz NULL;
UPDATE public.vacation_manager_queue SET entity_id = vacation_request_id WHERE entity_id IS NULL;
ALTER TABLE public.vacation_manager_queue ALTER COLUMN vacation_request_id DROP NOT NULL;
ALTER TABLE public.vacation_manager_queue ADD CONSTRAINT vacation_manager_queue_kind_consistency
  CHECK ((kind = 'queue' AND vacation_request_id IS NOT NULL AND expires_at IS NULL)
      OR (kind = 'reservation' AND entity_id IS NOT NULL AND expires_at IS NOT NULL));
CREATE UNIQUE INDEX vacation_manager_queue_reservation_uq
  ON public.vacation_manager_queue (entity_type, entity_id) WHERE kind = 'reservation';
CREATE INDEX vacation_manager_queue_active_reservation_idx
  ON public.vacation_manager_queue (company_id, expires_at) WHERE kind = 'reservation' AND state = 'in_progress';
COMMENT ON TABLE public.vacation_manager_queue IS
  'Mecanismo único de posse. kind=queue: fila de férias (expires_at vazio, posse até resolver). kind=reservation: reserva temporária da timeline (expires_at preenchido).';

CREATE OR REPLACE FUNCTION public.vacation_manager_queue_fill_entity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entity_id IS NULL THEN NEW.entity_id := NEW.vacation_request_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vacation_manager_queue_fill_entity_trg BEFORE INSERT ON public.vacation_manager_queue
  FOR EACH ROW EXECUTE FUNCTION public.vacation_manager_queue_fill_entity();

-- A política de leitura existente NÃO é alterada. Leituras de reservas só por função.
-- O claim existente da fila passa a recusar linhas que não sejam kind='queue'
-- (resto do corpo idêntico ao atual).
CREATE OR REPLACE FUNCTION public.vacation_manager_queue_claim(_queue_id uuid)
RETURNS vacation_manager_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vacation_manager_queue%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_row FROM public.vacation_manager_queue WHERE id = _queue_id AND kind = 'queue' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.company_id = v_row.company_id AND ur.role = 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para assumir este pedido';
  END IF;
  IF v_row.state = 'resolved' THEN RAISE EXCEPTION 'Este pedido já foi resolvido'; END IF;
  IF v_row.state = 'in_progress' AND v_row.claimed_by <> v_uid THEN
    RAISE EXCEPTION 'Este pedido já foi assumido por outro gestor';
  END IF;
  IF v_row.state = 'pending' THEN
    UPDATE public.vacation_manager_queue SET state = 'in_progress', claimed_by = v_uid, claimed_at = now()
     WHERE id = _queue_id AND state = 'pending' AND kind = 'queue' RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Este pedido já foi assumido por outro gestor'; END IF;
    INSERT INTO public.vacation_audit(vacation_request_id, company_id, actor_id, action, from_status, to_status, source, metadata)
    VALUES (v_row.vacation_request_id, v_row.company_id, v_uid, 'assumir_gestao', NULL, NULL, 'vacation_manager_queue',
            jsonb_build_object('queue_id', v_row.id, 'claimed_at', v_row.claimed_at));
  END IF;
  RETURN v_row;
END;
$function$;

-- vacation_manager_queue_sync: só toca kind='queue' (resolver por vacation_request_id).
CREATE OR REPLACE FUNCTION public.vacation_manager_queue_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pendente' THEN
    INSERT INTO public.vacation_manager_queue(vacation_request_id, company_id)
    VALUES (NEW.id, NEW.company_id)
    ON CONFLICT (vacation_request_id) DO NOTHING;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status::text IN ('pendente','aguardando_aprovacao')
    AND NEW.status::text NOT IN ('pendente','aguardando_aprovacao') THEN
    UPDATE public.vacation_manager_queue
       SET state = 'resolved', resolved_at = COALESCE(resolved_at, now())
     WHERE vacation_request_id = NEW.id AND kind = 'queue' AND state <> 'resolved';
  END IF;
  RETURN NEW;
END; $function$;

-- Valor configurável num único lugar.
CREATE OR REPLACE FUNCTION public.work_item_reservation_ttl()
RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '15 minutes' $$;

-- label sem artigo; art = artigo definido; cada frase compõe a preposição (a/na/da, as/nas/das).
CREATE OR REPLACE FUNCTION public._work_item_context(_entity_type text, _entity_id uuid, OUT company_id uuid, OUT label text, OUT art text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _entity_type = 'task' THEN
    SELECT t.company_id, 'tarefa "' || t.title || '"', 'a' INTO company_id, label, art FROM public.tasks t WHERE t.id = _entity_id;
  ELSIF _entity_type = 'recurrence' THEN
    SELECT r.company_id, 'recorrência "' || COALESCE(NULLIF(r.title,''), r.schedule_name, 'série') || '"', 'a'
      INTO company_id, label, art FROM public.task_recurrences r WHERE r.id = _entity_id;
  ELSIF _entity_type = 'vacation' THEN
    SELECT v.company_id, 'férias de ' || public._activity_name(v.user_id), 'as'
      INTO company_id, label, art FROM public.vacation_requests v WHERE v.id = _entity_id;
  ELSE
    RAISE EXCEPTION 'Tipo de item inválido';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._work_item_can_manage(_uid uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_uid) OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _uid AND ur.company_id = _company AND ur.role IN ('manager','owner'))
$$;
REVOKE ALL ON FUNCTION public._work_item_context(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_item_can_manage(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Função atómica única de reserva.
CREATE OR REPLACE FUNCTION public.work_item_claim(_entity_type text, _entity_id uuid, _force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_ctx record; v_row public.vacation_manager_queue%ROWTYPE; v_prev uuid; v_active boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_ctx FROM public._work_item_context(_entity_type, _entity_id);
  IF v_ctx.company_id IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF NOT public._work_item_can_manage(v_uid, v_ctx.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  INSERT INTO public.vacation_manager_queue(company_id, entity_type, entity_id, kind, state, claimed_by, claimed_at, expires_at, last_activity_at)
  VALUES (v_ctx.company_id, _entity_type, _entity_id, 'reservation', 'in_progress', v_uid, now(),
          now() + public.work_item_reservation_ttl(), now())
  ON CONFLICT (entity_type, entity_id) WHERE kind = 'reservation' DO NOTHING
  RETURNING * INTO v_row;
  IF FOUND THEN
    PERFORM public._activity_emit(v_ctx.company_id, v_uid, _entity_type, _entity_id, 'item_claimed', 'gestao',
      'Está a tratar ' || v_ctx.art || ' ' || v_ctx.label, '{}'::jsonb, 'user');
    RETURN jsonb_build_object('status', 'claimed');
  END IF;

  SELECT * INTO v_row FROM public.vacation_manager_queue
   WHERE kind = 'reservation' AND entity_type = _entity_type AND entity_id = _entity_id FOR UPDATE;
  v_active := v_row.state = 'in_progress' AND v_row.expires_at > now();

  IF v_active AND v_row.claimed_by = v_uid THEN
    UPDATE public.vacation_manager_queue SET expires_at = now() + public.work_item_reservation_ttl(), last_activity_at = now() WHERE id = v_row.id;
    RETURN jsonb_build_object('status', 'claimed');
  END IF;
  IF v_active AND NOT _force THEN
    RETURN jsonb_build_object('status', 'held', 'holder_id', v_row.claimed_by,
      'holder_name', public._activity_name(v_row.claimed_by), 'claimed_at', v_row.claimed_at,
      'last_activity_at', v_row.last_activity_at);
  END IF;
  IF v_row.state = 'in_progress' AND NOT v_active THEN
    PERFORM public._activity_emit(v_ctx.company_id, NULL, _entity_type, _entity_id, 'item_expired', 'gestao',
      'Reserva de ' || public._activity_name(v_row.claimed_by) || ' expirou por inatividade n' || v_ctx.art || ' ' || v_ctx.label, '{}'::jsonb, 'system');
  END IF;
  v_prev := CASE WHEN v_active THEN v_row.claimed_by END;

  UPDATE public.vacation_manager_queue
     SET state = 'in_progress', claimed_by = v_uid, claimed_at = now(), resolved_at = NULL,
         expires_at = now() + public.work_item_reservation_ttl(), last_activity_at = now()
   WHERE id = v_row.id;
  PERFORM public._activity_emit(v_ctx.company_id, v_uid, _entity_type, _entity_id, 'item_claimed', 'gestao',
    'Está a tratar ' || v_ctx.art || ' ' || v_ctx.label || COALESCE(' (assumiu de ' || public._activity_name(v_prev) || ')', ''),
    CASE WHEN v_prev IS NULL THEN '{}'::jsonb
         ELSE jsonb_build_object('Responsável', jsonb_build_object('de', public._activity_name(v_prev), 'para', public._activity_name(v_uid))) END,
    'user');
  RETURN jsonb_build_object('status', 'claimed', 'transferred_from', public._activity_name(v_prev));
END $$;

CREATE OR REPLACE FUNCTION public.work_item_touch(_entity_type text, _entity_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.vacation_manager_queue
     SET expires_at = now() + public.work_item_reservation_ttl(), last_activity_at = now()
   WHERE kind = 'reservation' AND entity_type = _entity_type AND entity_id = _entity_id
     AND claimed_by = auth.uid() AND state = 'in_progress' AND expires_at > now();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.work_item_release(_entity_type text, _entity_id uuid, _reason text DEFAULT 'closed')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.vacation_manager_queue%ROWTYPE; v_ctx record;
BEGIN
  UPDATE public.vacation_manager_queue SET state = 'resolved', resolved_at = now()
   WHERE kind = 'reservation' AND entity_type = _entity_type AND entity_id = _entity_id
     AND claimed_by = auth.uid() AND state = 'in_progress'
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_ctx FROM public._work_item_context(_entity_type, _entity_id);
  PERFORM public._activity_emit(v_row.company_id, auth.uid(), _entity_type, _entity_id,
    CASE WHEN _reason = 'saved' THEN 'item_done' ELSE 'item_released' END, 'gestao',
    CASE WHEN _reason = 'saved' THEN COALESCE('Concluiu o tratamento d' || v_ctx.art || ' ' || v_ctx.label, 'Concluiu o tratamento do item') ELSE COALESCE('Libertou ' || v_ctx.art || ' ' || v_ctx.label, 'Libertou o item') END,
    '{}'::jsonb, 'user');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.work_item_in_progress(_company_id uuid)
RETURNS TABLE(entity_type text, entity_id uuid, holder_id uuid, holder_name text, label text,
              claimed_at timestamptz, last_activity_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_ctx record;
BEGIN
  IF NOT public._work_item_can_manage(auth.uid(), _company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  FOR r IN
    UPDATE public.vacation_manager_queue q SET state = 'resolved', resolved_at = now()
     WHERE q.kind = 'reservation' AND q.company_id = _company_id AND q.state = 'in_progress' AND q.expires_at <= now()
    RETURNING q.entity_type, q.entity_id, q.claimed_by
  LOOP
    SELECT * INTO v_ctx FROM public._work_item_context(r.entity_type, r.entity_id);
    PERFORM public._activity_emit(_company_id, NULL, r.entity_type, r.entity_id, 'item_expired', 'gestao',
      'Reserva de ' || public._activity_name(r.claimed_by) || ' expirou por inatividade ' || COALESCE('n' || v_ctx.art || ' ' || v_ctx.label, 'no item'),
      '{}'::jsonb, 'system');
  END LOOP;
  RETURN QUERY
  SELECT q.entity_type, q.entity_id, q.claimed_by, public._activity_name(q.claimed_by),
         (SELECT c.art || ' ' || c.label FROM public._work_item_context(q.entity_type, q.entity_id) c),
         q.claimed_at, q.last_activity_at, q.expires_at
    FROM public.vacation_manager_queue q
   WHERE q.kind = 'reservation' AND q.company_id = _company_id AND q.state = 'in_progress' AND q.expires_at > now()
   ORDER BY q.claimed_at;
END $$;

REVOKE ALL ON FUNCTION public.work_item_claim(text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_item_touch(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_item_release(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_item_in_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_item_claim(text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_item_touch(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_item_release(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_item_in_progress(uuid) TO authenticated;