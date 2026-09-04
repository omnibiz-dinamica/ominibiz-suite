-- Restaura colunas operacionais de tasks exigidas por public.timesheet_operational_list.
-- Aditiva e idempotente: não altera registros, RLS ou outros objetos.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS no_start_reason text,
  ADD COLUMN IF NOT EXISTS no_start_reason_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_start_reason_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;