CREATE POLICY "Managers can read own company recurrence failures"
ON public.task_dedupe_audit
FOR SELECT
TO authenticated
USING (
  entity = 'task_recurrences'
  AND kind = 'materialize_error'
  AND public.is_company_manager(auth.uid(), (details->>'company_id')::uuid)
);