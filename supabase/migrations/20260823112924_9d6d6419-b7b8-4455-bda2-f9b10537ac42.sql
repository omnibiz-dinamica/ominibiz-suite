DO $$
DECLARE
  invalid_count integer;
  allowed text[] := ARRAY[
    'cleaning_services',
    'restaurant_delivery',
    'generic',
    'building_materials',
    'hospitality',
    'auto_repair'
  ];
BEGIN
  -- 1) Validar valores existentes ANTES de recriar o CHECK (idempotente e seguro).
  SELECT count(*) INTO invalid_count
  FROM public.companies
  WHERE business_vertical IS NOT NULL
    AND NOT (business_vertical = ANY (allowed));

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Abortado: % empresa(s) com business_vertical fora da lista permitida.', invalid_count;
  END IF;

  -- 2) Recriar o CHECK apenas com a lista expandida. Nenhum UPDATE de dados.
  ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_business_vertical_check;

  ALTER TABLE public.companies
    ADD CONSTRAINT companies_business_vertical_check
    CHECK (business_vertical = ANY (ARRAY[
      'cleaning_services'::text,
      'restaurant_delivery'::text,
      'generic'::text,
      'building_materials'::text,
      'hospitality'::text,
      'auto_repair'::text
    ]));
END $$;