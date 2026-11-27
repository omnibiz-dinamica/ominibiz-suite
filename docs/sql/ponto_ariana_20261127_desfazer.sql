-- OmniBiz · 27/11/2026 — DESFAZER a correção do ponto da Ariana
-- Repõe o ponto e as duas tarefas exatamente como estavam (backup).
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public._bkp_ponto_ariana_20261127') IS NULL THEN
    RAISE EXCEPTION 'PARAR: backup não encontrado (correção não aplicada ou já desfeita). Nada foi alterado.';
  END IF;
END
$guard$;

UPDATE public.time_entries te SET
  task_id = (b.row->>'task_id')::uuid,
  started_at = (b.row->>'started_at')::timestamptz,
  ended_at = (b.row->>'ended_at')::timestamptz,
  paused_at = (b.row->>'paused_at')::timestamptz,
  resumed_at = (b.row->>'resumed_at')::timestamptz,
  prior_pause_seconds = (b.row->>'prior_pause_seconds')::int,
  effective_minutes = (b.row->>'effective_minutes')::int,
  origin = b.row->>'origin',
  last_edited_by = (b.row->>'last_edited_by')::uuid,
  last_edited_at = (b.row->>'last_edited_at')::timestamptz,
  last_edit_reason = b.row->>'last_edit_reason',
  updated_at = now()
FROM public._bkp_ponto_ariana_20261127 b
WHERE b.kind = 'time_entry' AND te.id = (b.row->>'id')::uuid;

UPDATE public.tasks t SET
  status = (b.row->>'status')::public.task_status,
  started_at = (b.row->>'started_at')::timestamptz,
  completed_at = (b.row->>'completed_at')::timestamptz,
  updated_at = now()
FROM public._bkp_ponto_ariana_20261127 b
WHERE b.kind = 'task' AND t.id = (b.row->>'id')::uuid;

DELETE FROM public.time_entries_audit
WHERE time_entry_id = '4d2de330-ecf0-435c-82ed-03e039d8d9ce'
  AND reason LIKE 'Correção 27/11: ponto batido na tarefa de 27/11 23:30%';

DROP TABLE public._bkp_ponto_ariana_20261127;
COMMIT;
