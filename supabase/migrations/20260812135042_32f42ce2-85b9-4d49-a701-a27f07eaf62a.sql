ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS business_vertical text NOT NULL DEFAULT 'cleaning_services';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_business_vertical_check'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_business_vertical_check
      CHECK (business_vertical IN ('cleaning_services','restaurant_delivery','generic'));
  END IF;
END $$;