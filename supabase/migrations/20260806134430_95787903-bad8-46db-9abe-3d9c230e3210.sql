-- 1) employee-* buckets: require company membership on the self-match branch
DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['employee-docs','employee-signatures','employee-expenses'] LOOP
    NULL;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "employee-docs read owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-docs write owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-docs update owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-docs delete owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-signatures read owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-signatures write owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-signatures update owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-signatures delete owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-expenses read owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-expenses write owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-expenses update owner or manager" ON storage.objects;
DROP POLICY IF EXISTS "employee-expenses delete owner or manager" ON storage.objects;

CREATE POLICY "employee-docs read owner or manager" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'employee-docs' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-docs write owner or manager" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'employee-docs' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-docs update owner or manager" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'employee-docs' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-docs delete owner or manager" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'employee-docs' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-signatures read owner or manager" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'employee-signatures' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-signatures write owner or manager" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'employee-signatures' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-signatures update owner or manager" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'employee-signatures' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-signatures delete owner or manager" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'employee-signatures' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-expenses read owner or manager" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'employee-expenses' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-expenses write owner or manager" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'employee-expenses' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-expenses update owner or manager" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'employee-expenses' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "employee-expenses delete owner or manager" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'employee-expenses' AND (
  public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

-- 2) punch-photos: explicit policies, path = {company_id}/{user_id}/...
DROP POLICY IF EXISTS "punch-photos insert own" ON storage.objects;
DROP POLICY IF EXISTS "punch-photos read own or manager" ON storage.objects;
DROP POLICY IF EXISTS "punch-photos delete manager or super admin" ON storage.objects;

CREATE POLICY "punch-photos insert own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'punch-photos'
  AND (split_part(name,'/',2))::uuid = auth.uid()
  AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid));

CREATE POLICY "punch-photos read own or manager" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'punch-photos' AND (
  public.is_super_admin(auth.uid())
  OR public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)
  OR ((split_part(name,'/',2))::uuid = auth.uid() AND public.is_company_member(auth.uid(), (split_part(name,'/',1))::uuid))));

CREATE POLICY "punch-photos delete manager or super admin" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'punch-photos' AND (
  public.is_super_admin(auth.uid())
  OR public.is_company_manager(auth.uid(), (split_part(name,'/',1))::uuid)));