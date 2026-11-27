-- OmniBiz · 27/11/2026 — Ponto da Ariana 26–27/11 (SÓ LEITURA, não altera nada)
WITH a AS (
  SELECT id, full_name FROM public.profiles WHERE full_name ILIKE 'ariana%'
)
SELECT 'PONTO' AS tipo, a.full_name, te.id::text AS id,
       to_char(te.started_at AT TIME ZONE 'Europe/Brussels','DD/MM HH24:MI') AS inicio,
       to_char(te.ended_at   AT TIME ZONE 'Europe/Brussels','DD/MM HH24:MI') AS fim,
       te.effective_minutes AS minutos, te.voided_at IS NOT NULL AS anulado, te.origin,
       te.task_id::text AS tarefa_id, t.title AS tarefa, cl.name AS cliente,
       to_char(COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date),'DD/MM') AS dia_tarefa,
       t.status::text AS estado_tarefa
FROM a JOIN public.time_entries te ON te.user_id = a.id
LEFT JOIN public.tasks t ON t.id = te.task_id
LEFT JOIN public.clients cl ON cl.id = t.client_id
WHERE te.started_at >= '2026-11-25' AND te.started_at < '2026-11-29'
UNION ALL
SELECT 'TAREFA', a.full_name, t.id::text,
       to_char(t.scheduled_for AT TIME ZONE 'UTC','DD/MM HH24:MI'),
       to_char(t.scheduled_end AT TIME ZONE 'UTC','DD/MM HH24:MI'),
       NULL, t.deleted_at IS NOT NULL, NULL,
       t.recurrence_id::text, t.title, cl.name,
       to_char(COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date),'DD/MM'),
       t.status::text
FROM a JOIN public.tasks t ON t.assigned_to = a.id
LEFT JOIN public.clients cl ON cl.id = t.client_id
WHERE COALESCE(t.recurrence_date, (t.scheduled_for AT TIME ZONE 'UTC')::date) BETWEEN '2026-11-26' AND '2026-11-27'
ORDER BY 1, 4;
