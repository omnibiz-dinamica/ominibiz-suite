-- OmniBiz · 27/11/2026 — Ariana: estado atual das tarefas (SÓ LEITURA)
SELECT t.id, t.title, t.status::text, t.assigned_to = p.id AS e_da_ariana, t.deleted_at,
       to_char(t.scheduled_for AT TIME ZONE 'UTC','DD/MM HH24:MI') AS inicio_prog,
       to_char(t.scheduled_end AT TIME ZONE 'UTC','DD/MM HH24:MI') AS fim_prog,
       to_char(t.updated_at AT TIME ZONE 'Europe/Brussels','DD/MM HH24:MI') AS alterada_em,
       (SELECT count(*) FROM public.time_entries te WHERE te.task_id = t.id AND te.voided_at IS NULL) AS pontos
FROM public.tasks t
CROSS JOIN (SELECT id FROM public.profiles WHERE full_name ILIKE 'ariana%' LIMIT 1) p
WHERE t.id IN ('110c37e8-a5e3-45e0-a970-3b75785ddc5b','1be8775d-9acb-4364-8c54-c5c434ad0243',
               '779ad17b-058a-4f72-9808-619ff23bca71','4b9fec51-d5d0-4323-8119-5b0070d32015');
