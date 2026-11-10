-- =====================================================================
-- OmniBiz · URGENTE 10/11/2026 — "Abrir mês para conferência" (Grupo V-clean)
-- Desfazer: abrir_mes_desfazer.sql
--
-- 1) Apaga os 134 avisos "Folha de ponto disponível para conferência" enviados
--    hoje às 09:48:35 (outubro) e 10:37:42 UTC (novembro).
-- 2) Apaga os 71 períodos "Aguardando conferência" criados por esses cliques
--    (30 de outubro + 41 de novembro; sem versões nem assinaturas).
--    Os períodos que já existiam antes de hoje não são tocados.
--    (Os 2 registos de auditoria "REPORT_VIEWED" desses períodos saem junto.)
--    Antes de apagar, tudo é copiado para tabelas _omnibiz_revert_20261110_*.
-- 3) A função antiga timesheet_open_month (avisa TODOS) deixa de poder ser
--    chamada; a nova timesheet_open_month_for só abre para os funcionários
--    escolhidos (lista obrigatória).
-- 4) Conferência Previsto x Real: decidir já não cria período novo (só atualiza
--    os totais se o período do mês já existir).
-- Se alguma contagem não bater, PARA e nada é alterado.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE
  v_n int;
BEGIN
  IF to_regclass('public._omnibiz_revert_20261110_notifications') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND name ILIKE 'Grupo V-clean') THEN
    RAISE EXCEPTION 'PARAR: empresa Grupo V-clean não encontrada com este id. Nada foi alterado.';
  END IF;
  IF md5(pg_get_functiondef('public.timesheet_open_month(uuid,integer,integer)'::regprocedure)) <> '019633a1d370e764ea4e2f4072d1e7e1' THEN
    RAISE EXCEPTION 'PARAR: timesheet_open_month diferente da leitura de 10/11. Nada foi alterado.';
  END IF;

  SELECT count(*) INTO v_n FROM public.notifications
  WHERE company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
    AND event::text = 'timesheet_report_available'
    AND created_at IN ('2026-11-10 09:48:35.05303+00', '2026-11-10 10:37:42.699277+00');
  IF v_n <> 134 THEN
    RAISE EXCEPTION 'PARAR: esperava 134 avisos, encontrei %. Nada foi alterado.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.timesheet_periods p
  WHERE p.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
    AND p.created_at IN ('2026-11-10 09:48:35.05303+00', '2026-11-10 10:37:42.699277+00');
  IF v_n <> 71 THEN
    RAISE EXCEPTION 'PARAR: esperava 71 períodos do clique, encontrei %. Nada foi alterado.', v_n;
  END IF;

  -- Nenhum deles pode ter sido assinado/trabalhado desde o clique
  SELECT count(*) INTO v_n FROM public.timesheet_periods p
  WHERE p.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
    AND p.created_at IN ('2026-11-10 09:48:35.05303+00', '2026-11-10 10:37:42.699277+00')
    AND (p.status::text <> 'aguardando_funcionario' OR COALESCE(p.current_version, 0) <> 0 OR p.signed_at IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.timesheet_period_versions v WHERE v.period_id = p.id)
         OR EXISTS (SELECT 1 FROM public.timesheet_audit_events e WHERE e.period_id = p.id AND e.event <> 'REPORT_VIEWED'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PARAR: % período(s) do clique já foram mexidos (assinatura/versão/correção). Nada foi alterado.', v_n;
  END IF;
END
$guard$;

-- Cópias (para o desfazer)
CREATE TABLE public._omnibiz_revert_20261110_notifications AS
SELECT * FROM public.notifications
WHERE company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
  AND event::text = 'timesheet_report_available'
  AND created_at IN ('2026-11-10 09:48:35.05303+00', '2026-11-10 10:37:42.699277+00');

CREATE TABLE public._omnibiz_revert_20261110_periods AS
SELECT * FROM public.timesheet_periods
WHERE company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
  AND created_at IN ('2026-11-10 09:48:35.05303+00', '2026-11-10 10:37:42.699277+00');

CREATE TABLE public._omnibiz_revert_20261110_audit AS
SELECT e.* FROM public.timesheet_audit_events e
WHERE e.period_id IN (SELECT id FROM public._omnibiz_revert_20261110_periods);

ALTER TABLE public._omnibiz_revert_20261110_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._omnibiz_revert_20261110_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._omnibiz_revert_20261110_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._omnibiz_revert_20261110_notifications, public._omnibiz_revert_20261110_periods,
              public._omnibiz_revert_20261110_audit FROM PUBLIC, anon, authenticated;

-- 1) e 2) Reverter
DELETE FROM public.notifications n
USING public._omnibiz_revert_20261110_notifications b WHERE n.id = b.id;

DELETE FROM public.timesheet_periods p
USING public._omnibiz_revert_20261110_periods b WHERE p.id = b.id;

-- 3) Botão antigo deixa de funcionar; nova função só com funcionários escolhidos
REVOKE ALL ON FUNCTION public.timesheet_open_month(uuid, integer, integer) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.timesheet_open_month_for(_company_id uuid, _year integer, _month integer, _employee_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid;
  v_count integer := 0;
  v_row public.timesheet_periods;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.is_company_manager(v_uid, _company_id) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _employee_ids IS NULL OR cardinality(_employee_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um funcionário.';
  END IF;
  IF cardinality(_employee_ids) > 500 THEN
    RAISE EXCEPTION 'Demasiados funcionários de uma vez (máx. 500).';
  END IF;
  IF _month < 1 OR _month > 12 OR _year < 2000 OR _year > 2100 THEN
    RAISE EXCEPTION 'Mês inválido.';
  END IF;

  FOR v_emp IN SELECT DISTINCT unnest(_employee_ids) LOOP
    -- Só funcionários desta empresa
    IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.company_id = _company_id AND ur.user_id = v_emp AND ur.role = 'employee') THEN
      CONTINUE;
    END IF;
    v_row := public.timesheet_period_ensure(_company_id, v_emp, _year, _month);
    -- Só avisa quem ainda tem a folha por conferir (não reavisa assinadas/fechadas)
    IF v_row.status::text IN ('em_aberto', 'aguardando_funcionario', 'aguardando_correcao') THEN
      PERFORM public._notify(
        _company_id, v_emp, NULL, 'timesheet_report_available',
        'Folha de ponto disponível para conferência',
        'O seu relatório de ' || lpad(_month::text, 2, '0') || '/' || _year::text ||
          ' está disponível para conferência e assinatura.',
        'media', jsonb_build_object('year', _year, 'month', _month)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END
$f$;
REVOKE ALL ON FUNCTION public.timesheet_open_month_for(uuid, integer, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timesheet_open_month_for(uuid, integer, integer, uuid[]) TO authenticated;

-- 4) Conferência: não criar período novo ao decidir
DO $patch$
DECLARE
  v_def text;
  v_n int;
BEGIN
  IF to_regprocedure('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
    RETURN;
  END IF;
  v_def := pg_get_functiondef('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)'::regprocedure);
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'IF v_is_manager THEN\s+PERFORM public\.timesheet_period_ensure', 'g');
  IF v_n <> 1 THEN RAISE EXCEPTION 'PARAR: ponto da conferência encontrado % vezes. Nada foi alterado.', v_n; END IF;
  v_def := regexp_replace(v_def, 'IF v_is_manager THEN(\s+)PERFORM public\.timesheet_period_ensure',
    'IF v_is_manager AND EXISTS (SELECT 1 FROM public.timesheet_periods tp
        WHERE tp.company_id = _company_id AND tp.employee_id = _employee_id
          AND tp.period_year = EXTRACT(YEAR FROM v_date)::int AND tp.period_month = EXTRACT(MONTH FROM v_date)::int) THEN\1PERFORM public.timesheet_period_ensure');
  EXECUTE v_def;
END
$patch$;

COMMIT;

SELECT jsonb_pretty(jsonb_build_object(
  'avisos_apagados', (SELECT count(*) FROM public._omnibiz_revert_20261110_notifications),
  'periodos_apagados', (SELECT count(*) FROM public._omnibiz_revert_20261110_periods),
  'avisos_que_restam_do_clique', (SELECT count(*) FROM public.notifications WHERE company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'
      AND event::text = 'timesheet_report_available'
      AND created_at IN ('2026-11-10 09:48:35.05303+00', '2026-11-10 10:37:42.699277+00')),
  'periodos_outubro_restantes', (SELECT count(*) FROM public.timesheet_periods WHERE company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND period_year = 2026 AND period_month = 10),
  'periodos_novembro_restantes', (SELECT count(*) FROM public.timesheet_periods WHERE company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND period_year = 2026 AND period_month = 11),
  'botao_antigo_bloqueado', NOT has_function_privilege('authenticated', 'public.timesheet_open_month(uuid,integer,integer)', 'EXECUTE'),
  'nova_funcao', has_function_privilege('authenticated', 'public.timesheet_open_month_for(uuid,integer,integer,uuid[])', 'EXECUTE'),
  'conferencia_sem_criar_periodo', position('tp.period_month = EXTRACT(MONTH FROM v_date)' in pg_get_functiondef('public.timesheet_reconciliation_decide(uuid,uuid,uuid,uuid,text,text)'::regprocedure)) > 0
)) AS resultado;
