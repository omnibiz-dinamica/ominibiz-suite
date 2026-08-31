-- Total de minutos contratados para cada execução do serviço do cliente.
-- O valor é distribuído entre os responsáveis da tarefa; não representa
-- remuneração e não altera o tempo efetivamente apontado.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contracted_minutes integer;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_contracted_minutes_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_contracted_minutes_check
  CHECK (contracted_minutes IS NULL OR contracted_minutes > 0);

COMMENT ON COLUMN public.clients.contracted_minutes IS
  'Carga total de minutos contratada para uma execução do serviço, distribuída entre os responsáveis da tarefa';
