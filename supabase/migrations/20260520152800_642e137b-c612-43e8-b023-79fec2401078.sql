ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS placeholder_map jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.contract_templates
  ALTER COLUMN body DROP NOT NULL;

-- Storage policies for contracts bucket (super admin)
DO $$ BEGIN
  CREATE POLICY "super_admin contracts read"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'contracts' AND public.is_super_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "super_admin contracts write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'contracts' AND public.is_super_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "super_admin contracts update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'contracts' AND public.is_super_admin(auth.uid()))
    WITH CHECK (bucket_id = 'contracts' AND public.is_super_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "super_admin contracts delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'contracts' AND public.is_super_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;