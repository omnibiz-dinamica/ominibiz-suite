-- =====================================================================
-- OmniBiz · 19/11/2026 — SUP-2026-000167: notificação de tarefa "incompleta".
-- Desfazer: notificacao_tarefa_20261119_desfazer.sql
--
-- Antes:
--   • tarefa REATRIBUÍDA (editar → outro funcionário): "Tarefa atribuida a
--     voce" só com o nome da tarefa, sem dia, sem hora e sem link;
--   • tarefa nova: "HappyKot - X · HappyKot - X · 21/11/2026 16:00" (o
--     cliente repetido, porque o título da tarefa já é o nome do cliente).
-- Agora as duas usam o mesmo texto curto:
--   "HappyKot - X · 21/11/2026 · 16:00–17:00"
--   (cliente só aparece à parte se for diferente do título; fim = scheduled_end
--   ou, sem ele, due_at; horas como estão
--   na tarefa — hora de parede, igual ao ecrã), e a reatribuição ganha o link
--   direto para a tarefa. Instruções do cliente e nome do funcionário
--   continuam a ser acrescentados pelos triggers de notifications.
-- Só muda o texto das notificações NOVAS; as já enviadas ficam como estão.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE d1 text; d2 text; n int;
  p1 text := $p$v_body := NEW\.title\s*\|\|\s*COALESCE\(' · ' \|\| v_client, ''\)\s*\|\|\s*COALESCE\(' · ' \|\| v_day, ''\)\s*\|\|\s*COALESCE\(' ' \|\| v_time, ''\);$p$;
  a2 text := $a$'task_assigned', 'Tarefa atribuida a voce', NEW.title, 'media', '{}'::jsonb);$a$;
BEGIN
  IF to_regprocedure('public._task_notification_body(text,text,timestamptz,date,timestamptz)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'notificacao_tarefa_20261119') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  d1 := pg_get_functiondef('public.tasks_notify_insert()'::regprocedure);
  d2 := pg_get_functiondef('public.tasks_notify_update()'::regprocedure);
  SELECT count(*) INTO n FROM regexp_matches(d1, p1, 'g');
  IF n <> 1 THEN
    RAISE EXCEPTION 'PARAR: tasks_notify_insert não está como esperado (%). Nada foi alterado.', n;
  END IF;
  IF (length(d2) - length(replace(d2, a2, ''))) / length(a2) <> 1 THEN
    RAISE EXCEPTION 'PARAR: tasks_notify_update não está como esperado. Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'notificacao_tarefa_20261119', p::text, pg_get_functiondef(p), md5(pg_get_functiondef(p))
FROM unnest(ARRAY['public.tasks_notify_insert()'::regprocedure,
                  'public.tasks_notify_update()'::regprocedure]) p;

-- "Cliente · 21/11/2026 · 16:00–17:00" (hora de parede: componentes UTC, como no ecrã).
CREATE FUNCTION public._task_notification_body(
  _title text, _client text, _start timestamptz, _date date, _end timestamptz
) RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  SELECT NULLIF(concat_ws(' · ',
    NULLIF(btrim(_title), ''),
    CASE WHEN NULLIF(btrim(_client), '') IS NOT NULL
          AND lower(btrim(_client)) <> lower(btrim(COALESCE(_title, '')))
         THEN btrim(_client) END,
    to_char(COALESCE((_start AT TIME ZONE 'UTC')::date, _date, (_end AT TIME ZONE 'UTC')::date), 'DD/MM/YYYY'),
    CASE WHEN _start IS NOT NULL THEN
      to_char(_start AT TIME ZONE 'UTC', 'HH24:MI')
      || CASE WHEN _end IS NOT NULL AND _end > _start
                AND (_end AT TIME ZONE 'UTC')::date = (_start AT TIME ZONE 'UTC')::date
              THEN '–' || to_char(_end AT TIME ZONE 'UTC', 'HH24:MI') ELSE '' END
    END
  ), '')
$f$;

DO $apply$
DECLARE d text;
  p1 text := $p$v_body := NEW\.title\s*\|\|\s*COALESCE\(' · ' \|\| v_client, ''\)\s*\|\|\s*COALESCE\(' · ' \|\| v_day, ''\)\s*\|\|\s*COALESCE\(' ' \|\| v_time, ''\);$p$;
  a2 text := $a$'task_assigned', 'Tarefa atribuida a voce', NEW.title, 'media', '{}'::jsonb);$a$;
BEGIN
  d := pg_get_functiondef('public.tasks_notify_insert()'::regprocedure);
  d := regexp_replace(d, p1,
    $r$v_body := public._task_notification_body(NEW.title, v_client, NEW.scheduled_for, NEW.recurrence_date, COALESCE(NEW.scheduled_end, NEW.due_at)); -- SUP-167$r$);
  EXECUTE d;

  d := pg_get_functiondef('public.tasks_notify_update()'::regprocedure);
  d := replace(d, a2, $r$'task_assigned', 'Tarefa atribuída a você',
      public._task_notification_body(NEW.title,
        (SELECT c.name FROM public.clients c WHERE c.id = NEW.client_id AND c.company_id = NEW.company_id),
        NEW.scheduled_for, NEW.recurrence_date, COALESCE(NEW.scheduled_end, NEW.due_at)),
      'media',
      jsonb_build_object('link', '/app/tarefas?task=' || NEW.id::text,
        'client_id', NEW.client_id, 'company_id', NEW.company_id,
        'scheduled_for', NEW.scheduled_for, 'recurrence_date', NEW.recurrence_date,
        'due_at', NEW.due_at, 'origin', 'reassigned')); -- SUP-167$r$);
  EXECUTE d;
END
$apply$;

COMMIT;

SELECT jsonb_build_object(
  'nova_tarefa_atualizada', position('-- SUP-167' IN pg_get_functiondef('public.tasks_notify_insert()'::regprocedure)) > 0,
  'reatribuir_atualizado', position('-- SUP-167' IN pg_get_functiondef('public.tasks_notify_update()'::regprocedure)) > 0,
  'exemplo', public._task_notification_body('HappyKot - RUSSELBEEKSTRAAT 45 CM', 'HappyKot - RUSSELBEEKSTRAAT 45 CM',
             '2026-11-21T16:00:00Z', '2026-11-21', '2026-11-21T17:00:00Z')
)::text AS resultado;
