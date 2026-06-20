
-- Path convention: <company_id>/<profile_id>/<filename>
-- employee-docs
CREATE POLICY "employee-docs read members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-docs'
    AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid)
  );

CREATE POLICY "employee-docs write owner or manager"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-docs'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );

CREATE POLICY "employee-docs update owner or manager"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-docs'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );

CREATE POLICY "employee-docs delete owner or manager"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-docs'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );

-- employee-signatures
CREATE POLICY "employee-signatures read owner or manager"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-signatures'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );

CREATE POLICY "employee-signatures write owner or manager"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-signatures'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );

CREATE POLICY "employee-signatures update owner or manager"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-signatures'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );

CREATE POLICY "employee-signatures delete owner or manager"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-signatures'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );
