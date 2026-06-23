
DROP POLICY IF EXISTS "employee-expenses read members" ON storage.objects;
DROP POLICY IF EXISTS "employee-expenses write owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-expenses update owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-expenses delete owner or manager" ON storage.objects;

CREATE POLICY "employee-expenses read members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-expenses'
    AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid)
  );
CREATE POLICY "employee-expenses write owner or manager"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-expenses'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );
CREATE POLICY "employee-expenses update owner or manager"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-expenses'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );
CREATE POLICY "employee-expenses delete owner or manager"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-expenses'
    AND (
      public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
      OR (split_part(name,'/',2))::uuid = auth.uid()
    )
  );
