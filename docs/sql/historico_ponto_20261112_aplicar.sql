-- =====================================================================
-- OmniBiz · 12/11/2026 — Histórico de ponto do funcionário
-- Desfazer: historico_desfazer.sql
--
-- Nova função (só leitura) my_punch_history: devolve SÓ os pontos
-- encerrados do próprio utilizador (auth.uid()) na empresa indicada, com o
-- nome do cliente e as pausas — inclusive de tarefas já arquivadas, que a
-- RLS de clients esconderia ao funcionário. Não altera dados nem RLS.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.my_punch_history(uuid,date,date)') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: a função my_punch_history já existe. Nada foi alterado.';
  END IF;
  IF to_regclass('public.time_entry_pauses') IS NULL THEN
    RAISE EXCEPTION 'PARAR: tabela time_entry_pauses não encontrada. Nada foi alterado.';
  END IF;
END
$guard$;

CREATE FUNCTION public.my_punch_history(_company_id uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_tz text;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _company_id IS NULL OR _from IS NULL OR _to IS NULL THEN RAISE EXCEPTION 'Indique a empresa e o período'; END IF;
  IF _to < _from THEN RAISE EXCEPTION 'A data inicial tem de ser anterior à final'; END IF;
  IF _to - _from > 366 THEN RAISE EXCEPTION 'Período máximo: 1 ano'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.company_id = _company_id)
     AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa';
  END IF;

  SELECT COALESCE(NULLIF(btrim(c.timezone), ''), 'Europe/Lisbon') INTO v_tz
  FROM public.companies c WHERE c.id = _company_id;
  v_tz := COALESCE(v_tz, 'Europe/Lisbon');

  SELECT COALESCE(jsonb_agg(x.o ORDER BY x.started_at DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT te.started_at,
      jsonb_build_object(
        'id', te.id,
        'started_at', te.started_at,
        'ended_at', te.ended_at,
        'effective_minutes', te.effective_minutes,
        'paused_at', te.paused_at,
        'resumed_at', te.resumed_at,
        'prior_pause_seconds', te.prior_pause_seconds,
        'task_id', te.task_id,
        'task_title', t.title,
        'client_id', t.client_id,
        'client_name', cl.name,
        'scheduled_for', t.scheduled_for,
        'scheduled_end', t.scheduled_end,
        'recurrence_date', t.recurrence_date,
        'work_date', COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date,
                              (te.started_at AT TIME ZONE v_tz)::date),
        'pauses', COALESCE((SELECT jsonb_agg(jsonb_build_object('paused_at', p.paused_at, 'resumed_at', p.resumed_at)
                                            ORDER BY p.paused_at)
                            FROM public.time_entry_pauses p WHERE p.time_entry_id = te.id), '[]'::jsonb)
      ) AS o
    FROM public.time_entries te
    LEFT JOIN public.tasks t ON t.id = te.task_id
    LEFT JOIN public.clients cl ON cl.id = t.client_id
    WHERE te.user_id = v_uid
      AND te.company_id = _company_id
      AND te.ended_at IS NOT NULL
      AND te.voided_at IS NULL
      -- margem de 7 dias: o ponto pode ter sido feito noutro dia que o da tarefa
      AND te.started_at >= (_from - 7)::timestamp AT TIME ZONE v_tz
      AND te.started_at <  (_to + 8)::timestamp AT TIME ZONE v_tz
      AND COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date,
                   (te.started_at AT TIME ZONE v_tz)::date) BETWEEN _from AND _to
    ORDER BY te.started_at DESC
    LIMIT 2000
  ) x;
  RETURN v_out;
END
$f$;

REVOKE ALL ON FUNCTION public.my_punch_history(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_punch_history(uuid, date, date) TO authenticated;

COMMIT;

SELECT (to_regprocedure('public.my_punch_history(uuid,date,date)') IS NOT NULL)::text AS funcao_criada;
