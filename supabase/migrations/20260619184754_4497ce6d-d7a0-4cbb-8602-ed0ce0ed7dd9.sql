-- Restrict realtime broadcasts to per-user topics
DROP POLICY IF EXISTS "authenticated realtime access" ON realtime.messages;

CREATE POLICY "users access own realtime topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
);

-- Scope vacation insert policy to authenticated role only
DROP POLICY IF EXISTS "managers create vacations for members" ON public.vacation_requests;

CREATE POLICY "managers create vacations for members"
ON public.vacation_requests
FOR INSERT
TO authenticated
WITH CHECK (
  is_company_member(user_id, company_id)
  AND (
    is_company_manager(auth.uid(), company_id)
    OR is_company_owner(auth.uid(), company_id)
    OR is_super_admin(auth.uid())
  )
);