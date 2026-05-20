-- Tighten RLS for employees: restrict clients access to managers + assigned employees only.
DROP POLICY IF EXISTS "members view company clients" ON public.clients;

CREATE POLICY "managers view company clients"
ON public.clients FOR SELECT
TO authenticated
USING (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "employees view only assigned clients"
ON public.clients FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_assignees ca
    WHERE ca.client_id = clients.id
      AND ca.user_id = auth.uid()
  )
);