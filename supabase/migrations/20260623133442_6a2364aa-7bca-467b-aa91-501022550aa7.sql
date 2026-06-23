
-- Fix: restrict employee-docs read to owner or manager
DROP POLICY IF EXISTS "employee-docs read members" ON storage.objects;
CREATE POLICY "employee-docs read owner or manager"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-docs'
  AND (
    is_company_manager(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR (split_part(name, '/', 2))::uuid = auth.uid()
  )
);

-- Fix: restrict employee-expenses read to owner or manager
DROP POLICY IF EXISTS "employee-expenses read members" ON storage.objects;
CREATE POLICY "employee-expenses read owner or manager"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-expenses'
  AND (
    is_company_manager(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR (split_part(name, '/', 2))::uuid = auth.uid()
  )
);

-- Fix: payslips employee read own must also verify company membership
DROP POLICY IF EXISTS "payslips employee read own" ON storage.objects;
CREATE POLICY "payslips employee read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payslips'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- Fix: user_roles INSERT must ensure target user belongs to the same company,
-- preventing managers from granting roles to arbitrary users.
DROP POLICY IF EXISTS "managers insert operational roles" ON public.user_roles;
CREATE POLICY "managers insert operational roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND role = ANY (ARRAY['manager'::app_role, 'employee'::app_role])
  AND is_company_manager(auth.uid(), company_id)
  AND is_company_member(user_id, company_id)
);

-- Same constraint on UPDATE to avoid re-pointing a role to an outside user.
DROP POLICY IF EXISTS "managers update operational roles" ON public.user_roles;
CREATE POLICY "managers update operational roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  company_id IS NOT NULL
  AND role = ANY (ARRAY['manager'::app_role, 'employee'::app_role])
  AND is_company_manager(auth.uid(), company_id)
)
WITH CHECK (
  company_id IS NOT NULL
  AND role = ANY (ARRAY['manager'::app_role, 'employee'::app_role])
  AND is_company_manager(auth.uid(), company_id)
  AND is_company_member(user_id, company_id)
);
