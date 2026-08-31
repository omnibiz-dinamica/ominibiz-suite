-- Allow employees to resolve the client name for their own active tasks.
-- The existing client_assignees policy does not cover tasks assigned directly
-- to an employee, which made the UI fall back to the first eight UUID chars.
DROP POLICY IF EXISTS "employees view clients on assigned tasks" ON public.clients;

CREATE POLICY "employees view clients on assigned tasks"
  ON public.clients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.client_id = clients.id
        AND t.company_id = clients.company_id
        AND t.assigned_to = auth.uid()
        AND t.archived_at IS NULL
        AND t.deleted_at IS NULL
    )
  );
