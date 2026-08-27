-- Programacao habitual do cliente usada como sugestao no cadastro de tarefas.
-- Nao altera RBAC/RLS nem cria tarefas automaticamente.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS habitual_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_habitual_schedule_array_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_habitual_schedule_array_check
  CHECK (jsonb_typeof(habitual_schedule) = 'array');

COMMENT ON COLUMN public.clients.habitual_schedule IS
  'Programacao semanal opcional para sugestao de data e horario ao criar tarefas';
