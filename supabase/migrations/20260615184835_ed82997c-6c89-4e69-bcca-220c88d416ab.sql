
-- 1) Lock down financial columns on profiles at the column-privilege level.
--    RLS rows still let users see their own profile, but PostgREST will
--    refuse SELECT/UPDATE on these columns for the authenticated/anon roles.
REVOKE SELECT (manual_hour_rate, manual_fixed_rate, manual_mixed_base_fixed,
               manual_mixed_extra_hour_rate, manual_mixed_included_minutes,
               pay_model, pay_rate_source)
  ON public.profiles FROM authenticated, anon;

REVOKE UPDATE (manual_hour_rate, manual_fixed_rate, manual_mixed_base_fixed,
               manual_mixed_extra_hour_rate, manual_mixed_included_minutes,
               pay_model, pay_rate_source)
  ON public.profiles FROM authenticated, anon;

-- service_role keeps full access (already granted via GRANT ALL).

-- 2) Fix fleet storage UPDATE policy to also require company membership
--    on the first path segment, matching the INSERT policy pattern.
DROP POLICY IF EXISTS "fleet members update own files" ON storage.objects;
CREATE POLICY "fleet members update own files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fleet'
    AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    AND (storage.foldername(name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'fleet'
    AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );
