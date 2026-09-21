REVOKE ALL ON FUNCTION public.vacation_manager_queue_touch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vacation_manager_queue_touch() TO service_role;
REVOKE ALL ON FUNCTION public.vacation_manager_queue_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vacation_manager_queue_sync() TO service_role;
DROP POLICY "Managers view shared vacation queue" ON public.vacation_manager_queue;
CREATE POLICY "Managers view shared vacation queue"
ON public.vacation_manager_queue
FOR SELECT
TO authenticated
USING (
  (public.is_super_admin(auth.uid()) AND state <> 'resolved')
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.company_id = vacation_manager_queue.company_id
      AND ur.role = 'manager'
      AND vacation_manager_queue.state <> 'resolved'
      AND (
        vacation_manager_queue.state = 'pending'
        OR vacation_manager_queue.claimed_by = auth.uid()
      )
  )
);