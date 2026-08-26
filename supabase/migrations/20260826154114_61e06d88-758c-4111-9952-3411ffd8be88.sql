-- ADR-048 · assinatura calculada a partir do título + módulo (menos ruído)
CREATE OR REPLACE FUNCTION public.support_tickets_fill_signature()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_norm text;
  v_sig_norm text;
  v_sig_kw text[];
BEGIN
  NEW.norm_title := public.support_norm(NEW.title);
  v_norm := public.support_norm(
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'') || ' ' || coalesce(NEW.module,'')
  );
  NEW.search_norm := v_norm;
  NEW.problem_keywords := public.support_keywords(
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'') || ' ' || coalesce(NEW.module,'')
  );

  v_sig_norm := public.support_norm(coalesce(NEW.title,'') || ' ' || coalesce(NEW.module,''));
  v_sig_kw := public.support_keywords(coalesce(NEW.title,'') || ' ' || coalesce(NEW.module,''));
  NEW.problem_action := public.support_detect_action(v_sig_kw, v_sig_norm);
  NEW.problem_entity := public.support_detect_entity(v_sig_kw, v_sig_norm);

  IF NEW.primary_ticket_id = NEW.id THEN
    NEW.primary_ticket_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

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
  v_sig_norm text;
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

UPDATE public.support_tickets SET title = title;
