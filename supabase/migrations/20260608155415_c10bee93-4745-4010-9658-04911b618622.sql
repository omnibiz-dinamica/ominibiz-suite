
-- 1) HR settings: remove members' broad row read; expose only punch mode via RPC
DROP POLICY IF EXISTS "members view hr settings rows" ON public.company_hr_settings;

CREATE OR REPLACE FUNCTION public.get_company_punch_mode(_company_id uuid)
RETURNS punch_mode
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT default_punch_mode
  FROM public.company_hr_settings
  WHERE company_id = _company_id
    AND public.is_company_member(auth.uid(), _company_id)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_company_punch_mode(uuid) TO authenticated;

-- 2) Fleet bucket: tighten member read to own subfolder only
DROP POLICY IF EXISTS "fleet members read" ON storage.objects;

CREATE POLICY "fleet members read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'fleet'
  AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
    OR (storage.foldername(name))[2] = (auth.uid())::text
  )
);

-- 3) Realtime: require authenticated subscription
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    NULL;
  END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "authenticated realtime access" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "authenticated realtime access" ON realtime.messages FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)$p$;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
