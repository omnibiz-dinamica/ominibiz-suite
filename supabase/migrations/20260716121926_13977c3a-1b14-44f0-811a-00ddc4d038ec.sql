
-- Storage RLS for support-ticket-attachments bucket
-- Path convention: <company_id>/<ticket_id>/<uuid>-<sanitized-filename>

CREATE POLICY "super admin all support attachments"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'support-ticket-attachments' AND public.is_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'support-ticket-attachments' AND public.is_super_admin(auth.uid()));

CREATE POLICY "managers read own company support attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support-ticket-attachments'
  AND public.is_company_manager(
    auth.uid(),
    NULLIF((storage.foldername(name))[1], '')::uuid
  )
);

CREATE POLICY "managers upload own company support attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support-ticket-attachments'
  AND public.is_company_manager(
    auth.uid(),
    NULLIF((storage.foldername(name))[1], '')::uuid
  )
);
