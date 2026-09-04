-- SUP-2026-000140: keep task document metadata and storage paths tenant-safe.
-- The existing task_documents 1:N model is reused; this migration only tightens
-- the relationship between the task and the company already stored on a row.

DROP POLICY IF EXISTS "managers manage task docs" ON public.task_documents;
CREATE POLICY "managers manage task docs" ON public.task_documents
  FOR ALL TO authenticated
  USING (
    public.is_company_manager(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_documents.task_id
        AND t.company_id = task_documents.company_id
    )
  )
  WITH CHECK (
    public.is_company_manager(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_documents.task_id
        AND t.company_id = task_documents.company_id
    )
  );

DROP POLICY IF EXISTS "assignees view task docs" ON public.task_documents;
CREATE POLICY "assignees view task docs" ON public.task_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_documents.task_id
        AND t.company_id = task_documents.company_id
        AND t.assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "task-docs managers all" ON storage.objects;
CREATE POLICY "task-docs managers all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'task-docs'
    AND public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = ((storage.foldername(name))[2])::uuid
        AND t.company_id = ((storage.foldername(name))[1])::uuid
    )
  )
  WITH CHECK (
    bucket_id = 'task-docs'
    AND public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = ((storage.foldername(name))[2])::uuid
        AND t.company_id = ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS "task-docs assignees read" ON storage.objects;
CREATE POLICY "task-docs assignees read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-docs'
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = ((storage.foldername(name))[2])::uuid
        AND t.company_id = ((storage.foldername(name))[1])::uuid
        AND t.assigned_to = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
