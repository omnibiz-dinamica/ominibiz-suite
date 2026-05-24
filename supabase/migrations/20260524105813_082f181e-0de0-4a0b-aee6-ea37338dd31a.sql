-- 1) Restringe a política de UPDATE de vacation_requests do usuário comum:
--    só pode marcar como cancelado, e não pode tocar campos de decisão.
DROP POLICY IF EXISTS "users cancel own pending vacations" ON public.vacation_requests;
CREATE POLICY "users cancel own pending vacations"
  ON public.vacation_requests
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status IN ('pendente','aprovado'))
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'cancelado'
    AND decided_by IS NULL
    AND decided_at IS NULL
    AND decision_reason IS NULL
  );

-- 2) Fleet bucket: restringe upload e adiciona UPDATE policy
DROP POLICY IF EXISTS "fleet members upload" ON storage.objects;

CREATE POLICY "fleet managers upload anywhere"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fleet'
    AND public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "fleet members upload own subfolder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fleet'
    AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "fleet managers update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fleet'
    AND public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'fleet'
    AND public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "fleet members update own files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fleet'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'fleet'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 3) user_roles: RESTRICTIVE policy bloqueando qualquer escrita não-gestor.
--    SECURITY DEFINER RPCs (accept_invite) seguem funcionando — bypass RLS.
CREATE POLICY "restrict role writes to managers"
  ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id IS NOT NULL AND public.is_company_manager(auth.uid(), company_id))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (company_id IS NOT NULL AND public.is_company_manager(auth.uid(), company_id))
  );