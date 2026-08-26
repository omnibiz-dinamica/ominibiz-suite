-- =====================================================================
-- ADR-048 · Detecção de tickets duplicados / problemas semelhantes
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ---------------------------------------------------------------- norm
CREATE OR REPLACE FUNCTION public.support_norm(_t text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public', 'extensions' AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(lower(extensions.unaccent(coalesce(_t, ''))), '[^a-z0-9]+', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.support_keywords(_t text)
RETURNS text[] LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT w), '{}'::text[])
  FROM unnest(string_to_array(public.support_norm(_t), ' ')) AS w
  WHERE length(w) >= 4
    AND w NOT IN (
      'para','como','esta','este','estou','isso','pelo','pela','pelos','pelas','mais','menos',
      'quando','porque','porem','tambem','apenas','todos','todas','muito','pouco','fazer','feito',
      'nada','sobre','depois','antes','ainda','sempre','nunca','pode','posso','podia','deve','devia',
      'quero','queria','preciso','favor','bom','boa','dias','tarde','noite','erro','problema',
      'sistema','omnibiz','aplicacao','plataforma','pagina','ecra','tela','consigo','consegue',
      'aparece','acontece','mensagem','continua','sendo','tenho','temos','mesmo','mesma','outro','outra'
    )
$$;

-- ------------------------------------------------------- action lexicon
CREATE OR REPLACE FUNCTION public.support_detect_action(_kw text[], _norm text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  lex jsonb := jsonb_build_object(
    'refuse',   '["recusar","recusa","recuso","recusei","recusada","recusado","rejeitar","rejeito","rejeitada","rejeicao","negar","declinar"]',
    'approve',  '["aprovar","aprovacao","aprovada","aprovado","autorizar","autorizacao","validar","confirmar","confirmacao"]',
    'start',    '["iniciar","inicio","iniciada","iniciado","comecar","arrancar","retomar"]',
    'complete', '["concluir","conclusao","concluida","concluido","finalizar","terminar","encerrar","fechar","fecho"]',
    'create',   '["criar","criacao","criada","criado","adicionar","incluir","cadastrar","registar","registrar","abrir","agendar"]',
    'edit',     '["editar","alterar","alteracao","atualizar","corrigir","correcao","modificar","ajustar"]',
    'delete',   '["apagar","excluir","eliminar","remover","cancelar","cancelamento","cancelada","cancelado","arquivar"]',
    'view',     '["visualizar","aparecer","desaparecer","desapareceu","sumiu","some","invisivel","exibir","mostrar","listar","filtrar"]',
    'send',     '["enviar","envio","enviada","enviado","notificar","notificacao","email","whatsapp"]',
    'assign',  '["atribuir","atribuicao","designar","encaminhar","reatribuir","responsavel"]',
    'upload',  '["anexar","anexo","upload","carregar","importar","exportar","descarregar"]',
    'login',   '["entrar","login","autenticar","palavra","senha","credenciais","sessao"]',
    'save',    '["salvar","gravar","guardar","submeter"]',
    'punch',   '["picar","picagem","marcar","batida"]'
  );
  k text;
  arr jsonb;
BEGIN
  lex := (SELECT jsonb_object_agg(e.key, e.value::jsonb) FROM jsonb_each_text(lex) e);
  FOR k, arr IN SELECT key, value FROM jsonb_each(lex) LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(arr) t(w)
      WHERE t.w = ANY(_kw) OR _norm LIKE '%' || t.w || '%'
    ) THEN
      RETURN k;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.support_detect_entity(_kw text[], _norm text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  lex jsonb := jsonb_build_object(
    'task',        '["tarefa","tarefas","servico","servicos","ocorrencia","recorrencia","recorrente"]',
    'timesheet',   '["ponto","picagem","picagens","folha","jornada","horas","assiduidade"]',
    'vacation',    '["ferias","feria","ausencia","ausencias","falta","faltas"]',
    'expense',     '["despesa","despesas","reembolso","reembolsos"]',
    'payslip',     '["recibo","recibos","salario","vencimento","vencimentos"]',
    'client',      '["cliente","clientes"]',
    'employee',    '["funcionario","funcionarios","colaborador","colaboradores","utilizador","utilizadores","usuario","usuarios","equipa"]',
    'fleet',       '["veiculo","veiculos","viatura","viaturas","frota","combustivel","cartao","abastecimento"]',
    'ticket',      '["ticket","tickets","chamado","chamados","suporte"]',
    'notification','["notificacao","notificacoes","alerta","alertas"]',
    'navigation',  '["menu","navegacao","sidebar","barra","separador"]',
    'geo',         '["geolocalizacao","localizacao","raio","coordenadas"]',
    'report',      '["relatorio","relatorios","exportacao","dashboard","indicadores"]',
    'auth',        '["convite","convites","permissao","permissoes","acesso","acessos","perfil"]',
    'company',     '["empresa","empresas","contrato","contratos","faturacao","faturamento","fatura"]'
  );
  k text;
  arr jsonb;
BEGIN
  lex := (SELECT jsonb_object_agg(e.key, e.value::jsonb) FROM jsonb_each_text(lex) e);
  FOR k, arr IN SELECT key, value FROM jsonb_each(lex) LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(arr) t(w)
      WHERE t.w = ANY(_kw) OR _norm LIKE '%' || t.w || '%'
    ) THEN
      RETURN k;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ------------------------------------------------- columns + fill trigger
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS norm_title text,
  ADD COLUMN IF NOT EXISTS search_norm text,
  ADD COLUMN IF NOT EXISTS problem_keywords text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS problem_action text,
  ADD COLUMN IF NOT EXISTS problem_entity text,
  ADD COLUMN IF NOT EXISTS primary_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.support_tickets_fill_signature()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_norm text;
BEGIN
  NEW.norm_title := public.support_norm(NEW.title);
  v_norm := public.support_norm(
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'') || ' ' || coalesce(NEW.module,'')
  );
  NEW.search_norm := v_norm;
  NEW.problem_keywords := public.support_keywords(
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'') || ' ' || coalesce(NEW.module,'')
  );
  NEW.problem_action := public.support_detect_action(NEW.problem_keywords, v_norm);
  NEW.problem_entity := public.support_detect_entity(NEW.problem_keywords, v_norm);
  IF NEW.primary_ticket_id = NEW.id THEN
    NEW.primary_ticket_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_fill_signature ON public.support_tickets;
CREATE TRIGGER support_tickets_fill_signature
BEFORE INSERT OR UPDATE OF title, description, module, primary_ticket_id
ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_fill_signature();

UPDATE public.support_tickets SET title = title WHERE norm_title IS NULL;

CREATE INDEX IF NOT EXISTS support_tickets_norm_title_trgm
  ON public.support_tickets USING gin (norm_title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS support_tickets_search_norm_trgm
  ON public.support_tickets USING gin (search_norm extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS support_tickets_keywords_gin
  ON public.support_tickets USING gin (problem_keywords);
CREATE INDEX IF NOT EXISTS support_tickets_signature_idx
  ON public.support_tickets (problem_action, problem_entity);

-- --------------------------------------------------------------- links
CREATE TABLE IF NOT EXISTS public.support_ticket_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  related_ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'related' CHECK (relation IN ('duplicate','related')),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ticket_id <> related_ticket_id),
  UNIQUE (ticket_id, related_ticket_id)
);

GRANT SELECT, INSERT, DELETE ON public.support_ticket_links TO authenticated;
GRANT ALL ON public.support_ticket_links TO service_role;
ALTER TABLE public.support_ticket_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers read company ticket links" ON public.support_ticket_links
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin all ticket links" ON public.support_ticket_links
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- ------------------------------------------------------------ affected
CREATE TABLE IF NOT EXISTS public.support_ticket_affected (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, user_id)
);

GRANT SELECT ON public.support_ticket_affected TO authenticated;
GRANT ALL ON public.support_ticket_affected TO service_role;
ALTER TABLE public.support_ticket_affected ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own affected rows" ON public.support_ticket_affected
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "managers read company affected rows" ON public.support_ticket_affected
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_company_manager(auth.uid(), company_id));

CREATE INDEX IF NOT EXISTS support_ticket_affected_ticket_idx
  ON public.support_ticket_affected (ticket_id);
CREATE INDEX IF NOT EXISTS support_ticket_links_related_idx
  ON public.support_ticket_links (related_ticket_id);

-- =====================================================================
-- RPC · procurar semelhantes
-- =====================================================================
CREATE OR REPLACE FUNCTION public.support_find_similar(
  _company_id uuid,
  _type public.support_ticket_type,
  _title text,
  _description text,
  _module text DEFAULT NULL,
  _route text DEFAULT NULL,
  _limit int DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  v_member boolean;
  v_norm_title text;
  v_norm_full text;
  v_kw text[];
  v_action text;
  v_entity text;
  v_own jsonb := '[]'::jsonb;
  v_other_count int := 0;
  v_other_resolved int := 0;
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
  v_action := public.support_detect_action(v_kw, v_norm_full);
  v_entity := public.support_detect_entity(v_kw, v_norm_full);

  IF length(v_norm_title) < 5 THEN
    RETURN jsonb_build_object(
      'own', '[]'::jsonb,
      'others', jsonb_build_object('count', 0, 'resolved', 0),
      'signature', jsonb_build_object('action', v_action, 'entity', v_entity)
    );
  END IF;

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
      ) * CASE
            WHEN v_action IS NOT NULL AND s.problem_action IS NOT NULL AND s.problem_action <> v_action
              THEN 0.45 ELSE 1 END
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
  SELECT
    COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'level') DESC, (x->>'score')::numeric DESC)
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
                 'created_at', l.created_at,
                 'resolved_at', l.resolved_at,
                 'level', l.level,
                 'score', round(l.score, 3),
                 'affected_count', (
                   SELECT count(*) FROM public.support_ticket_affected a WHERE a.ticket_id = l.id
                 )
               ) AS x
        FROM leveled l
        WHERE l.level IS NOT NULL
          AND l.company_id = _company_id
        ORDER BY (l.level = 'strong') DESC, l.score DESC
        LIMIT GREATEST(COALESCE(_limit, 5), 1)
      ) q
    ), '[]'::jsonb),
    (SELECT count(*) FROM leveled l WHERE l.level IS NOT NULL AND l.company_id <> _company_id),
    (SELECT count(*) FROM leveled l WHERE l.level IS NOT NULL AND l.company_id <> _company_id
       AND l.status IN ('resolvido','fechado','resolved_by_manager'))
  INTO v_own, v_other_count, v_other_resolved;

  RETURN jsonb_build_object(
    'own', v_own,
    'others', jsonb_build_object('count', v_other_count, 'resolved', v_other_resolved),
    'signature', jsonb_build_object('action', v_action, 'entity', v_entity)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.support_find_similar(uuid, public.support_ticket_type, text, text, text, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.support_find_similar(uuid, public.support_ticket_type, text, text, text, text, int) TO authenticated;

-- =====================================================================
-- RPC · reportar o mesmo problema
-- =====================================================================
CREATE OR REPLACE FUNCTION public.support_report_same_problem(_ticket_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  v_company uuid;
  v_ticket public.support_tickets%ROWTYPE;
  v_visible boolean;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_is_sa := public.is_super_admin(v_uid);

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(p.current_company_id, p.company_id_primary) INTO v_company
    FROM public.profiles p WHERE p.id = v_uid;
  IF v_company IS NULL THEN
    v_company := v_ticket.company_id;
  END IF;

  v_visible := v_is_sa OR v_ticket.company_id = v_company;

  INSERT INTO public.support_ticket_affected(ticket_id, company_id, user_id, note)
  VALUES (_ticket_id, v_company, v_uid, NULLIF(btrim(coalesce(_note,'')), ''))
  ON CONFLICT (ticket_id, user_id) DO UPDATE
    SET note = COALESCE(EXCLUDED.note, public.support_ticket_affected.note);

  SELECT count(*) INTO v_count FROM public.support_ticket_affected WHERE ticket_id = _ticket_id;

  PERFORM public.support_ticket_log_event(
    _ticket_id, v_ticket.company_id, 'same_problem_reported',
    NULL, jsonb_build_object('affected_count', v_count),
    jsonb_build_object('reporter_company_id', v_company, 'note', _note)
  );

  IF v_ticket.company_id = v_company THEN
    PERFORM public.support_notify_managers(
      v_ticket.company_id, v_ticket.id,
      'Mais um relato · ' || v_ticket.ticket_number,
      'Outro utilizador informou estar a enfrentar o mesmo problema.',
      'ticket_updated'::public.notification_event,
      'media'::public.notification_priority
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'visible', v_visible,
    'affected_count', v_count,
    'ticket_number', CASE WHEN v_visible THEN v_ticket.ticket_number ELSE NULL END,
    'ticket_id', CASE WHEN v_visible THEN v_ticket.id ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.support_report_same_problem(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.support_report_same_problem(uuid, text) TO authenticated;

-- =====================================================================
-- RPC · ligar / desligar / ticket principal
-- =====================================================================
CREATE OR REPLACE FUNCTION public.support_link_tickets(
  _ticket_id uuid, _related_ticket_id uuid, _relation text DEFAULT 'related', _note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  a public.support_tickets%ROWTYPE;
  b public.support_tickets%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _relation NOT IN ('duplicate','related') THEN
    RAISE EXCEPTION 'invalid_relation' USING ERRCODE = 'P0001';
  END IF;
  IF _ticket_id = _related_ticket_id THEN
    RAISE EXCEPTION 'same_ticket' USING ERRCODE = 'P0001';
  END IF;
  v_is_sa := public.is_super_admin(v_uid);

  SELECT * INTO a FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO b FROM public.support_tickets WHERE id = _related_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;

  IF NOT v_is_sa THEN
    IF NOT (public.is_company_manager(v_uid, a.company_id) AND a.company_id = b.company_id) THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.support_ticket_links(company_id, ticket_id, related_ticket_id, relation, note, created_by)
  VALUES (a.company_id, _ticket_id, _related_ticket_id, _relation, NULLIF(btrim(coalesce(_note,'')), ''), v_uid)
  ON CONFLICT (ticket_id, related_ticket_id) DO UPDATE
    SET relation = EXCLUDED.relation, note = COALESCE(EXCLUDED.note, public.support_ticket_links.note)
  RETURNING id INTO v_id;

  IF _relation = 'duplicate' THEN
    UPDATE public.support_tickets
       SET primary_ticket_id = _related_ticket_id, updated_at = now()
     WHERE id = _ticket_id;
  END IF;

  PERFORM public.support_ticket_log_event(
    _ticket_id, a.company_id, 'ticket_linked', NULL,
    jsonb_build_object('related_ticket_id', _related_ticket_id, 'relation', _relation),
    jsonb_build_object('note', _note)
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.support_unlink_tickets(_link_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_link public.support_ticket_links%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_link FROM public.support_ticket_links WHERE id = _link_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.is_company_manager(v_uid, v_link.company_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.support_ticket_links WHERE id = _link_id;

  UPDATE public.support_tickets
     SET primary_ticket_id = NULL, updated_at = now()
   WHERE id = v_link.ticket_id AND primary_ticket_id = v_link.related_ticket_id;

  PERFORM public.support_ticket_log_event(
    v_link.ticket_id, v_link.company_id, 'ticket_unlinked', to_jsonb(v_link), NULL, '{}'::jsonb
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.support_link_tickets(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.support_link_tickets(uuid, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.support_unlink_tickets(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.support_unlink_tickets(uuid) TO authenticated;

-- =====================================================================
-- RPC · relacionados de um ticket
-- =====================================================================
CREATE OR REPLACE FUNCTION public.support_related_tickets(_ticket_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  t public.support_tickets%ROWTYPE;
  v_can_manage boolean;
  v_links jsonb;
  v_affected jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  v_is_sa := public.is_super_admin(v_uid);
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;

  v_can_manage := v_is_sa OR public.is_company_manager(v_uid, t.company_id);
  IF NOT (v_can_manage OR t.requester_user_id = v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO v_links
  FROM (
    SELECT jsonb_build_object(
      'link_id', l.id,
      'relation', l.relation,
      'direction', CASE WHEN l.ticket_id = _ticket_id THEN 'outgoing' ELSE 'incoming' END,
      'note', l.note,
      'created_at', l.created_at,
      'ticket', jsonb_build_object(
        'id', o.id,
        'ticket_number', o.ticket_number,
        'title', o.title,
        'status', o.status,
        'priority', o.priority,
        'created_at', o.created_at,
        'same_company', (o.company_id = t.company_id)
      )
    ) AS x
    FROM public.support_ticket_links l
    JOIN public.support_tickets o
      ON o.id = CASE WHEN l.ticket_id = _ticket_id THEN l.related_ticket_id ELSE l.ticket_id END
    WHERE (l.ticket_id = _ticket_id OR l.related_ticket_id = _ticket_id)
      AND (v_is_sa OR o.company_id = t.company_id)
  ) q;

  IF v_can_manage THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', a.id,
             'created_at', a.created_at,
             'note', a.note,
             'same_company', (a.company_id = t.company_id),
             'user_name', CASE WHEN a.company_id = t.company_id OR v_is_sa
                               THEN COALESCE(p.full_name, p.email) ELSE NULL END
           ) ORDER BY a.created_at DESC), '[]'::jsonb) INTO v_affected
      FROM public.support_ticket_affected a
      LEFT JOIN public.profiles p ON p.id = a.user_id
     WHERE a.ticket_id = _ticket_id;
  ELSE
    v_affected := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'can_manage', v_can_manage,
    'primary_ticket_id', t.primary_ticket_id,
    'links', v_links,
    'affected', v_affected,
    'affected_count', (SELECT count(*) FROM public.support_ticket_affected a WHERE a.ticket_id = _ticket_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.support_related_tickets(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.support_related_tickets(uuid) TO authenticated;

-- =====================================================================
-- RPC · clusters de duplicados (Super Admin)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.support_duplicate_clusters(_days int DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  IF NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'tickets_count')::int DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
             'action', t.problem_action,
             'entity', t.problem_entity,
             'tickets_count', count(*),
             'companies_count', count(DISTINCT t.company_id),
             'open_count', count(*) FILTER (WHERE t.status NOT IN ('fechado','resolvido','rejeitado','resolved_by_manager')),
             'last_at', max(t.created_at),
             'tickets', jsonb_agg(jsonb_build_object(
                 'id', t.id, 'ticket_number', t.ticket_number, 'title', t.title,
                 'status', t.status, 'priority', t.priority, 'company_id', t.company_id,
                 'created_at', t.created_at
               ) ORDER BY t.created_at DESC)
           ) AS x
    FROM public.support_tickets t
    WHERE t.created_at > now() - make_interval(days => GREATEST(COALESCE(_days, 180), 1))
      AND t.problem_action IS NOT NULL
      AND t.problem_entity IS NOT NULL
    GROUP BY t.problem_action, t.problem_entity
    HAVING count(*) > 1
  ) q;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.support_duplicate_clusters(int) FROM public;
GRANT EXECUTE ON FUNCTION public.support_duplicate_clusters(int) TO authenticated;

-- =====================================================================
-- RPC · notificar afetados (Super Admin)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.support_notify_affected(_ticket_id uuid, _message text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  t public.support_tickets%ROWTYPE;
  target record;
  n int := 0;
BEGIN
  IF NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(_message,'')) = '' THEN
    RAISE EXCEPTION 'empty_message' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;

  FOR target IN
    SELECT DISTINCT u.user_id, u.company_id FROM (
      SELECT a.user_id, a.company_id FROM public.support_ticket_affected a WHERE a.ticket_id = _ticket_id
      UNION
      SELECT t.requester_user_id, t.company_id
      UNION
      SELECT o.requester_user_id, o.company_id
        FROM public.support_ticket_links l
        JOIN public.support_tickets o
          ON o.id = CASE WHEN l.ticket_id = _ticket_id THEN l.related_ticket_id ELSE l.ticket_id END
       WHERE l.ticket_id = _ticket_id OR l.related_ticket_id = _ticket_id
    ) u WHERE u.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications(company_id, user_id, event, title, body, priority, metadata)
    VALUES (target.company_id, target.user_id, 'ticket_updated'::public.notification_event,
            'Atualização · ' || t.ticket_number, _message, 'media'::public.notification_priority,
            jsonb_build_object('ticket_id', t.id));
    n := n + 1;
  END LOOP;

  PERFORM public.support_ticket_log_event(
    _ticket_id, t.company_id, 'affected_notified', NULL,
    jsonb_build_object('recipients', n), jsonb_build_object('message', _message)
  );
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notify_affected(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.support_notify_affected(uuid, text) TO authenticated;
