ALTER TABLE public.task_documents
  ADD CONSTRAINT task_documents_mime_whitelist
  CHECK (mime_type IN ('application/pdf','image/png','image/jpeg','image/jpg'));