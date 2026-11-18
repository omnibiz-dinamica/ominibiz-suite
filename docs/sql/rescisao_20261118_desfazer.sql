-- OmniBiz · DESFAZER rescisao_20261118_aplicar.sql (SUP-308)
-- Desbloqueia quem o mecanismo bloqueou, apaga funções/triggers/cron e as
-- colunas novas. NÃO reativa quem passou a Inativo (isso faz-se em Equipe).
BEGIN;
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'rescisao_20261118') THEN
    RAISE EXCEPTION 'PARAR: o aplicar não correu. Nada foi alterado.';
  END IF;
END
$guard$;
UPDATE auth.users u SET banned_until = NULL
  FROM public.profiles p WHERE p.id = u.id AND p.access_blocked_at IS NOT NULL;
SELECT cron.unschedule('employee-terminations-daily');
DROP TRIGGER IF EXISTS trg_profiles_access_after ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_access_guard ON public.profiles;
DROP FUNCTION IF EXISTS public._profiles_access_after();
DROP FUNCTION IF EXISTS public._profiles_access_guard();
DROP FUNCTION IF EXISTS public.employee_terminations_daily();
DROP FUNCTION IF EXISTS public.employee_apply_access(uuid);
DROP FUNCTION IF EXISTS public.my_access_blocked();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS access_authorized_until, DROP COLUMN IF EXISTS access_blocked_at;
ALTER TABLE public.company_hr_settings DROP COLUMN IF EXISTS termination_grace_days;
DELETE FROM public._omnibiz_fn_backup WHERE tag = 'rescisao_20261118';
COMMIT;
SELECT 'desfeito' AS resultado;
