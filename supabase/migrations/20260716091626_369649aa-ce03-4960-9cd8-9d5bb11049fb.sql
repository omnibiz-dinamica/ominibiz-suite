ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manual_hourly_rate numeric(12,4),
  ADD COLUMN IF NOT EXISTS manual_fixed_rate numeric(12,4);

COMMENT ON COLUMN public.profiles.manual_hourly_rate IS 'ADR-017: override do valor/hora deste funcionário; NULL herda de companies.default_hourly_rate';
COMMENT ON COLUMN public.profiles.manual_fixed_rate IS 'ADR-017: override do valor fixo por tarefa; NULL herda de companies.default_fixed_rate';