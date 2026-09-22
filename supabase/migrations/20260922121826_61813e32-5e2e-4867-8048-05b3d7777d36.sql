DROP POLICY IF EXISTS "authenticated read destinations" ON public.support_destinations;
DROP POLICY IF EXISTS "authenticated read active destinations" ON public.support_destinations;
CREATE POLICY "authenticated read active destinations"
  ON public.support_destinations FOR SELECT TO authenticated
  USING (is_active OR public.is_super_admin(auth.uid()));