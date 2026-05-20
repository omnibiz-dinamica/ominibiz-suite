CREATE TABLE public.vehicle_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NULL,
  kind public.vehicle_kind NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX vehicle_catalog_unique
  ON public.vehicle_catalog (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    lower(brand),
    lower(COALESCE(model, ''))
  );

CREATE INDEX vehicle_catalog_lookup
  ON public.vehicle_catalog (company_id, kind, brand);

ALTER TABLE public.vehicle_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authenticated views global or own company catalog"
ON public.vehicle_catalog FOR SELECT TO authenticated
USING (
  company_id IS NULL
  OR public.is_company_member(auth.uid(), company_id)
);

CREATE POLICY "managers insert company catalog"
ON public.vehicle_catalog FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND public.is_company_manager(auth.uid(), company_id)
);

CREATE POLICY "managers update company catalog"
ON public.vehicle_catalog FOR UPDATE TO authenticated
USING (company_id IS NOT NULL AND public.is_company_manager(auth.uid(), company_id))
WITH CHECK (company_id IS NOT NULL AND public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "managers delete company catalog"
ON public.vehicle_catalog FOR DELETE TO authenticated
USING (company_id IS NOT NULL AND public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin all catalog"
ON public.vehicle_catalog FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
