-- ============================================================
-- ADR-049 · Destino obrigatório do ticket (filas de atendimento)
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretary';

-- 1) Catálogo extensível de destinos/filas ------------------------------------
CREATE TABLE IF NOT EXISTS public.support_destinations (
  code         text PRIMARY KEY,
  label        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  icon         text NOT NULL DEFAULT 'LifeBuoy',
  -- papel (public.app_role, guardado como texto para permitir novos papéis
  -- sem migrações destrutivas) que atende esta fila. NULL = apenas gestor/SA.
  target_role  text,
  is_technical boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 100,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.support_destinations TO authenticated;
GRANT ALL ON public.support_destinations TO service_role;

ALTER TABLE public.support_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read destinations" ON public.support_destinations;
CREATE POLICY "authenticated read destinations"
  ON public.support_destinations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "super admin manage destinations" ON public.support_destinations;
CREATE POLICY "super admin manage destinations"
  ON public.support_destinations FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_support_destinations_updated_at ON public.support_destinations;
CREATE TRIGGER trg_support_destinations_updated_at
  BEFORE UPDATE ON public.support_destinations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.support_destinations (code, label, description, icon, target_role, is_technical, sort_order)
VALUES
  ('tech', 'Suporte / Desenvolvimento',
   'Problemas técnicos, erros, bugs e alterações do sistema.', 'Wrench', 'super_admin', true, 10),
  ('accounting', 'Contabilista',
   'Contabilidade, documentos, pagamentos, recibos, fiscalidade, folha de pagamento e assuntos relacionados.', 'BarChart3', 'accountant', false, 20),
  ('secretary', 'Secretária',
   'Questões administrativas, documentos, organização, solicitações internas e assuntos gerais.', 'ClipboardList', 'secretary', false, 30)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      target_role = EXCLUDED.target_role,
      is_technical = EXCLUDED.is_technical,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

-- 2) Coluna de destino no ticket (fila ≠ responsável) ------------------------
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS destination_code text;

UPDATE public.support_tickets
   SET destination_code = CASE
         WHEN type IN ('financeiro','recibos') THEN 'accounting'
         ELSE 'tech'
       END
 WHERE destination_code IS NULL;

ALTER TABLE public.support_tickets
  ALTER COLUMN destination_code SET DEFAULT 'tech',
  ALTER COLUMN destination_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_destination_code_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_destination_code_fkey
      FOREIGN KEY (destination_code) REFERENCES public.support_destinations(code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_destination
  ON public.support_tickets(company_id, destination_code, status);

-- 3) Acesso à fila ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.support_has_destination_access(
  _user_id uuid, _company_id uuid, _destination_code text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.support_destinations d
      JOIN public.user_roles ur
        ON ur.user_id = _user_id
       AND ur.role::text = d.target_role
       AND (ur.company_id = _company_id OR d.is_technical)
     WHERE d.code = _destination_code
       AND d.target_role IS NOT NULL
  )
$$;

-- Papéis de fila (contabilista/secretária) leem e respondem apenas os tickets
-- destinados à sua fila, na sua empresa. Nada mais é ampliado.
DROP POLICY IF EXISTS "destination queue view support_tickets" ON public.support_tickets;
CREATE POLICY "destination queue view support_tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.support_has_destination_access(auth.uid(), company_id, destination_code));

DROP POLICY IF EXISTS "destination queue view support_ticket_messages" ON public.support_ticket_messages;
CREATE POLICY "destination queue view support_ticket_messages"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (
    NOT is_internal AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_ticket_messages.ticket_id
         AND public.support_has_destination_access(auth.uid(), t.company_id, t.destination_code)
    )
  );

DROP POLICY IF EXISTS "destination queue insert support_ticket_messages" ON public.support_ticket_messages;
CREATE POLICY "destination queue insert support_ticket_messages"
  ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    is_internal = false AND author_user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_ticket_messages.ticket_id
         AND t.company_id = support_ticket_messages.company_id
         AND public.support_has_destination_access(auth.uid(), t.company_id, t.destination_code)
    )
  );

DROP POLICY IF EXISTS "destination queue view support_ticket_events" ON public.support_ticket_events;
CREATE POLICY "destination queue view support_ticket_events"
  ON public.support_ticket_events FOR SELECT TO authenticated
  USING (
    event_type <> 'internal_note_added' AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_ticket_events.ticket_id
         AND public.support_has_destination_access(auth.uid(), t.company_id, t.destination_code)
    )
  );

DROP POLICY IF EXISTS "destination queue view support_ticket_attachments" ON public.support_ticket_attachments;
CREATE POLICY "destination queue view support_ticket_attachments"
  ON public.support_ticket_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_ticket_attachments.ticket_id
         AND public.support_has_destination_access(auth.uid(), t.company_id, t.destination_code)
    )
  );

-- 4) Notificação da fila de destino ------------------------------------------
CREATE OR REPLACE FUNCTION public.support_notify_destination(
  _company_id uuid, _ticket_id uuid, _destination_code text,
  _title text, _body text,
  _event public.notification_event DEFAULT 'ticket_created'::public.notification_event,
  _priority public.notification_priority DEFAULT 'media'::public.notification_priority
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  d public.support_destinations%ROWTYPE;
  target uuid;
  n int := 0;
BEGIN
  SELECT * INTO d FROM public.support_destinations WHERE code = _destination_code;
  IF NOT FOUND OR d.target_role IS NULL THEN
    RETURN 0;
  END IF;

  IF d.is_technical THEN
    RETURN public.support_notify_super_admins(_company_id, _ticket_id, _title, _body, _event, _priority);
  END IF;

  FOR target IN
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role::text = d.target_role
       AND ur.company_id = _company_id
  LOOP
    INSERT INTO public.notifications(company_id, user_id, event, title, body, priority, metadata)
    VALUES (_company_id, target, _event, _title, _body, _priority,
            jsonb_build_object('ticket_id', _ticket_id, 'destination_code', _destination_code));
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- 5) Criação de ticket com destino obrigatório -------------------------------
DROP FUNCTION IF EXISTS public.create_support_ticket(uuid, support_ticket_type, support_ticket_priority, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  _company_id uuid,
  _type public.support_ticket_type,
  _priority public.support_ticket_priority,
  _title text,
  _description text,
  _module text,
  _route text,
  _page_url text,
  _technical_context jsonb,
  _destination_code text DEFAULT 'tech'
) RETURNS TABLE(id uuid, ticket_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  new_ticket public.support_tickets%ROWTYPE;
  v_is_sa boolean;
  v_is_mgr boolean;
  v_is_member boolean;
  v_created_by_role text;
  v_support_level text;
  v_owner_role text;
  v_escalated boolean;
  v_dest public.support_destinations%ROWTYPE;
BEGIN
  v_is_sa := public.is_super_admin(auth.uid());
  v_is_mgr := public.is_company_manager(auth.uid(), _company_id);
  v_is_member := v_is_mgr OR v_is_sa OR EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND (p.current_company_id = _company_id OR p.company_id_primary = _company_id)
  );

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dest FROM public.support_destinations
   WHERE code = COALESCE(NULLIF(_destination_code, ''), 'tech') AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'destination_required' USING ERRCODE = 'P0001';
  END IF;

  IF (
    SELECT count(*) FROM public.support_tickets
    WHERE requester_user_id = auth.uid()
      AND created_at > now() - interval '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  IF v_is_sa THEN
    v_created_by_role := 'super_admin';
    v_support_level := 'technical';
    v_owner_role := 'super_admin';
    v_escalated := true;
  ELSIF v_is_mgr THEN
    v_created_by_role := 'manager';
    v_support_level := 'company';
    v_owner_role := 'manager';
    v_escalated := false;
  ELSE
    v_created_by_role := 'employee';
    v_support_level := 'company';
    v_owner_role := 'manager';
    v_escalated := false;
  END IF;

  INSERT INTO public.support_tickets(
    company_id, requester_user_id, type, priority, title, description,
    module, route, page_url, technical_context,
    support_level, current_owner_role, escalated_to_super_admin, created_by_role,
    status, destination_code
  ) VALUES (
    _company_id, auth.uid(), _type, _priority, _title, _description,
    NULLIF(_module, ''), NULLIF(_route, ''), NULLIF(_page_url, ''),
    COALESCE(_technical_context, '{}'::jsonb),
    v_support_level, v_owner_role, v_escalated, v_created_by_role,
    'aberto'::public.support_ticket_status, v_dest.code
  )
  RETURNING * INTO new_ticket;

  PERFORM public.support_ticket_log_event(
    new_ticket.id, new_ticket.company_id,
    CASE v_created_by_role
      WHEN 'employee' THEN 'employee_ticket_created'
      WHEN 'super_admin' THEN 'super_admin_opened_ticket'
      ELSE 'manager_ticket_opened'
    END,
    NULL, to_jsonb(new_ticket),
    jsonb_build_object('destination_code', v_dest.code, 'destination_label', v_dest.label)
  );

  -- Gestores continuam a ser notificados (fluxo actual inalterado)
  IF v_created_by_role IN ('employee','manager') THEN
    PERFORM public.support_notify_managers(
      new_ticket.company_id, new_ticket.id,
      'Novo ticket · ' || new_ticket.ticket_number,
      new_ticket.title,
      'ticket_created'::public.notification_event,
      CASE new_ticket.priority
        WHEN 'urgente' THEN 'urgente'::public.notification_priority
        WHEN 'alta' THEN 'alta'::public.notification_priority
        ELSE 'media'::public.notification_priority
      END
    );
  ELSIF v_created_by_role = 'super_admin' THEN
    PERFORM public.support_notify_managers(
      new_ticket.company_id, new_ticket.id,
      'Novo ticket técnico · ' || new_ticket.ticket_number,
      new_ticket.title,
      'ticket_created'::public.notification_event,
      'alta'::public.notification_priority
    );
  END IF;

  -- Notificação específica da fila de destino
  PERFORM public.support_notify_destination(
    new_ticket.company_id, new_ticket.id, v_dest.code,
    'Novo ticket destinado a ' || v_dest.label || ' · ' || new_ticket.ticket_number,
    new_ticket.title,
    'ticket_created'::public.notification_event,
    CASE new_ticket.priority
      WHEN 'urgente' THEN 'urgente'::public.notification_priority
      WHEN 'alta' THEN 'alta'::public.notification_priority
      ELSE 'media'::public.notification_priority
    END
  );

  RETURN QUERY SELECT new_ticket.id, new_ticket.ticket_number;
END;
$$;

-- 6) Reencaminhamento de destino (auditado) ----------------------------------
CREATE OR REPLACE FUNCTION public.support_set_ticket_destination(
  _ticket_id uuid, _destination_code text, _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t public.support_tickets%ROWTYPE;
  d public.support_destinations%ROWTYPE;
  v_old public.support_destinations%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin(auth.uid()) OR public.is_company_manager(auth.uid(), t.company_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO d FROM public.support_destinations WHERE code = _destination_code AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'destination_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF d.code = t.destination_code THEN
    RETURN;
  END IF;

  SELECT * INTO v_old FROM public.support_destinations WHERE code = t.destination_code;

  UPDATE public.support_tickets
     SET destination_code = d.code,
         updated_at = now()
   WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, t.company_id, 'destination_changed',
    jsonb_build_object('destination_code', t.destination_code, 'destination_label', v_old.label),
    jsonb_build_object('destination_code', d.code, 'destination_label', d.label),
    COALESCE(jsonb_build_object('reason', _reason), '{}'::jsonb)
  );

  PERFORM public.support_notify_destination(
    t.company_id, _ticket_id, d.code,
    'Ticket encaminhado para ' || d.label || ' · ' || t.ticket_number,
    t.title,
    'ticket_updated'::public.notification_event,
    CASE t.priority
      WHEN 'urgente' THEN 'urgente'::public.notification_priority
      WHEN 'alta' THEN 'alta'::public.notification_priority
      ELSE 'media'::public.notification_priority
    END
  );
END;
$$;

-- 7) Mensagens e estado por papéis de fila -----------------------------------
CREATE OR REPLACE FUNCTION public.post_support_ticket_message(
  _ticket_id uuid, _message text, _is_internal boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  is_sa boolean;
  is_queue boolean;
  new_msg_id uuid;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  is_sa := public.is_super_admin(auth.uid());
  is_queue := public.support_has_destination_access(auth.uid(), ticket.company_id, ticket.destination_code);

  IF NOT (is_sa OR public.is_company_manager(auth.uid(), ticket.company_id) OR is_queue) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF _is_internal AND NOT is_sa THEN
    RAISE EXCEPTION 'internal_notes_super_admin_only' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.support_ticket_messages(ticket_id, company_id, author_user_id, message, is_internal)
  VALUES (_ticket_id, ticket.company_id, auth.uid(), _message, COALESCE(_is_internal, false))
  RETURNING id INTO new_msg_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id,
    CASE WHEN _is_internal THEN 'internal_note_added' ELSE 'message_added' END,
    NULL,
    jsonb_build_object('message_id', new_msg_id, 'is_internal', _is_internal),
    '{}'::jsonb
  );

  IF (is_sa OR is_queue) AND ticket.first_response_at IS NULL AND NOT _is_internal THEN
    UPDATE public.support_tickets SET first_response_at = now() WHERE id = _ticket_id;
  END IF;

  IF NOT COALESCE(_is_internal, false) THEN
    IF is_sa OR is_queue THEN
      PERFORM public.support_notify_user(
        ticket.requester_user_id, ticket.company_id, _ticket_id,
        'Resposta · ' || ticket.ticket_number, ticket.title,
        'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
      );
    ELSE
      PERFORM public.support_notify_super_admins(
        ticket.company_id, _ticket_id,
        'Nova mensagem · ' || ticket.ticket_number, ticket.title,
        'ticket_message_added'::public.notification_event, 'media'::public.notification_priority
      );
    END IF;
  END IF;

  RETURN new_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_support_ticket_status(
  _ticket_id uuid, _new_status public.support_ticket_status, _reason text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  ticket public.support_tickets%ROWTYPE;
  old_status public.support_ticket_status;
  is_sa boolean;
  is_queue boolean;
BEGIN
  SELECT * INTO ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  is_sa := public.is_super_admin(auth.uid());
  is_queue := public.support_has_destination_access(auth.uid(), ticket.company_id, ticket.destination_code);

  IF NOT is_sa THEN
    IF NOT is_queue THEN
      RAISE EXCEPTION 'super_admin_only' USING ERRCODE = '42501';
    END IF;
    -- Papéis de fila só podem usar os estados do atendimento normal
    IF _new_status NOT IN (
      'aberto'::public.support_ticket_status,
      'em_analise'::public.support_ticket_status,
      'aguardando_cliente'::public.support_ticket_status,
      'resolvido'::public.support_ticket_status
    ) THEN
      RAISE EXCEPTION 'status_not_allowed_for_role' USING ERRCODE = '42501';
    END IF;
  END IF;

  old_status := ticket.status;

  UPDATE public.support_tickets SET
    status = _new_status,
    resolved_at = CASE WHEN _new_status = 'resolvido' THEN now() ELSE resolved_at END,
    closed_at = CASE WHEN _new_status = 'fechado' THEN now() ELSE closed_at END
  WHERE id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, ticket.company_id, 'status_changed',
    jsonb_build_object('status', old_status),
    jsonb_build_object('status', _new_status),
    COALESCE(jsonb_build_object('reason', _reason), '{}'::jsonb)
  );

  PERFORM public.support_notify_user(
    ticket.requester_user_id, ticket.company_id, _ticket_id,
    'Status atualizado · ' || ticket.ticket_number,
    'Novo status: ' || _new_status::text,
    CASE WHEN _new_status = 'resolvido' THEN 'ticket_resolved'::public.notification_event
         ELSE 'ticket_status_changed'::public.notification_event END,
    'media'::public.notification_priority
  );
END;
$$;

-- 8) Semelhança considera o destino como reforço (nunca como filtro) --------
DROP FUNCTION IF EXISTS public.support_find_similar(uuid, support_ticket_type, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.support_find_similar(
  _company_id uuid,
  _type public.support_ticket_type,
  _title text,
  _description text,
  _module text DEFAULT NULL::text,
  _route text DEFAULT NULL::text,
  _limit integer DEFAULT 5,
  _destination_code text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  v_member boolean;
  v_norm_title text;
  v_norm_full text;
  v_sig_norm text;
  v_kw text[];
  v_action text;
  v_entity text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_is_sa := public.is_super_admin(v_uid);
  v_member := v_is_sa
    OR public.is_company_manager(v_uid, _company_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = v_uid
         AND (p.current_company_id = _company_id OR p.company_id_primary = _company_id)
    );
  IF NOT v_member THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_norm_title := public.support_norm(_title);
  v_norm_full := public.support_norm(
    coalesce(_title,'') || ' ' || coalesce(_description,'') || ' ' || coalesce(_module,'')
  );
  v_kw := public.support_keywords(
    coalesce(_title,'') || ' ' || coalesce(_description,'') || ' ' || coalesce(_module,'')
  );
  v_sig_norm := public.support_norm(coalesce(_title,'') || ' ' || coalesce(_module,''));
  v_action := public.support_detect_action(
    public.support_keywords(coalesce(_title,'') || ' ' || coalesce(_module,'')), v_sig_norm);
  v_entity := public.support_detect_entity(
    public.support_keywords(coalesce(_title,'') || ' ' || coalesce(_module,'')), v_sig_norm);

  IF length(v_norm_title) < 5 THEN
    RETURN jsonb_build_object(
      'own', '[]'::jsonb,
      'others', jsonb_build_object('count', 0, 'resolved', 0),
      'signature', jsonb_build_object('action', v_action, 'entity', v_entity)
    );
  END IF;

  RETURN (
    WITH scored AS (
      SELECT
        t.*,
        extensions.similarity(v_norm_title, t.norm_title) AS sim_title,
        extensions.similarity(v_norm_full, t.search_norm) AS sim_body,
        CASE
          WHEN cardinality(v_kw) = 0 OR cardinality(t.problem_keywords) = 0 THEN 0::numeric
          ELSE cardinality(ARRAY(SELECT unnest(v_kw) INTERSECT SELECT unnest(t.problem_keywords)))::numeric
               / greatest(least(cardinality(v_kw), cardinality(t.problem_keywords)), 1)
        END AS kw_overlap
      FROM public.support_tickets t
      WHERE t.created_at > now() - interval '365 days'
        AND (
          t.norm_title % v_norm_title
          OR (v_entity IS NOT NULL AND t.problem_entity = v_entity)
          OR t.problem_keywords && v_kw
        )
    ), final AS (
      SELECT s.*,
        LEAST(1.0, (
          0.40 * s.sim_title
          + 0.15 * s.sim_body
          + 0.15 * s.kw_overlap
          + CASE WHEN v_action IS NOT NULL AND s.problem_action = v_action THEN 0.15 ELSE 0 END
          + CASE WHEN v_entity IS NOT NULL AND s.problem_entity = v_entity THEN 0.15 ELSE 0 END
          + CASE WHEN _module IS NOT NULL AND s.module IS NOT NULL
                   AND public.support_norm(s.module) = public.support_norm(_module) THEN 0.05 ELSE 0 END
          + CASE WHEN _route IS NOT NULL AND s.route = _route THEN 0.05 ELSE 0 END
          + CASE WHEN s.type = _type THEN 0.03 ELSE 0 END
          + CASE WHEN _destination_code IS NOT NULL AND s.destination_code = _destination_code THEN 0.05 ELSE 0 END
        ) * CASE
              WHEN v_action IS NOT NULL AND s.problem_action IS NOT NULL AND s.problem_action <> v_action
                THEN 0.60 ELSE 1 END
        ) AS score
      FROM scored s
    ), leveled AS (
      SELECT f.*,
        CASE
          WHEN f.sim_title >= 0.72
            OR (v_action IS NOT NULL AND v_entity IS NOT NULL
                AND f.problem_action = v_action AND f.problem_entity = v_entity
                AND f.score >= 0.60)
            THEN 'strong'
          WHEN f.score >= 0.32 THEN 'related'
          ELSE NULL
        END AS level
      FROM final f
    )
    SELECT jsonb_build_object(
      'own', COALESCE((
        SELECT jsonb_agg(q.x)
        FROM (
          SELECT jsonb_build_object(
                   'id', l.id,
                   'ticket_number', l.ticket_number,
                   'title', l.title,
                   'description', left(l.description, 400),
                   'status', l.status,
                   'priority', l.priority,
                   'type', l.type,
                   'module', l.module,
                   'destination_code', l.destination_code,
                   'created_at', l.created_at,
                   'resolved_at', l.resolved_at,
                   'level', l.level,
                   'score', round(l.score, 3),
                   'affected_count', (
                     SELECT count(*) FROM public.support_ticket_affected a WHERE a.ticket_id = l.id
                   )
                 ) AS x
          FROM leveled l
          WHERE l.level IS NOT NULL AND l.company_id = _company_id
          ORDER BY (l.level = 'strong') DESC, l.score DESC
          LIMIT GREATEST(COALESCE(_limit, 5), 1)
        ) q
      ), '[]'::jsonb),
      'others', jsonb_build_object(
        'count', (SELECT count(*) FROM leveled l WHERE l.level IS NOT NULL AND l.company_id <> _company_id),
        'resolved', (SELECT count(*) FROM leveled l WHERE l.level IS NOT NULL AND l.company_id <> _company_id
                       AND l.status IN ('resolvido','fechado','resolved_by_manager'))
      ),
      'signature', jsonb_build_object('action', v_action, 'entity', v_entity)
    )
  );
END;
$$;