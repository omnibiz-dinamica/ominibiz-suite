-- Expand clients.billing_mode CHECK to include 'monthly' (Fase B — plano Atualizações Operacionais V1.0)
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_billing_mode_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_billing_mode_check
  CHECK (billing_mode = ANY (ARRAY['hourly'::text, 'fixed'::text, 'mixed'::text, 'monthly'::text]));