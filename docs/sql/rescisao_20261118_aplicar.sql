-- =====================================================================
-- OmniBiz · 18/11/2026 — SUP-2026-000308: rescisão (saída do funcionário)
-- Desfazer: rescisao_20261118_desfazer.sql
--
-- Decisões do Eduardo (18/11):
--  • Na data de rescisão a pessoa deixa de entrar no sistema, salvo se a
--    gestão autorizar (profiles.access_authorized_until = "acesso autorizado até").
--  • Continua visível para a gestão N dias após a saída (fecho de contas);
--    N por empresa em company_hr_settings.termination_grace_days (padrão 45).
--    Depois passa sozinha a Inativo (tarefa diária). Todo o histórico fica.
--  • As tarefas depois da saída são mostradas ao gestor para ele confirmar
--    (no ecrã; este SQL não apaga tarefas).
-- O bloqueio de entrada usa o próprio Auth (banned_until) e termina as
-- sessões abertas; só desbloqueia quem este mecanismo bloqueou.
-- Hoje só 1 perfil tem data de rescisão: Douglas da Silva Chaves (04/09);
-- ao correr, fica sem acesso e, na tarefa diária, passa a Inativo.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'rescisao_20261118') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'
             AND column_name IN ('access_authorized_until', 'access_blocked_at')) THEN
    RAISE EXCEPTION 'PARAR: as colunas de acesso já existem. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'employee-terminations-daily') THEN
    RAISE EXCEPTION 'PARAR: a tarefa diária já existe. Nada foi alterado.';
  END IF;
END
$guard$;

-- Marca de aplicação (sem funções antigas a repor: tudo o que segue é novo).
INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
VALUES ('rescisao_20261118', 'marker', 'novo: colunas, funções, triggers e cron', md5('rescisao_20261118'));

ALTER TABLE public.company_hr_settings
  ADD COLUMN IF NOT EXISTS termination_grace_days integer NOT NULL DEFAULT 45
  CHECK (termination_grace_days BETWEEN 0 AND 365);
COMMENT ON COLUMN public.company_hr_settings.termination_grace_days IS
  'SUP-308: dias em que o funcionário continua visível após a rescisão (fecho de contas).';

ALTER TABLE public.profiles
  ADD COLUMN access_authorized_until date,
  ADD COLUMN access_blocked_at timestamptz;
COMMENT ON COLUMN public.profiles.access_authorized_until IS
  'SUP-308: a gestão autoriza o acesso ao sistema após a rescisão até esta data (inclusive).';
COMMENT ON COLUMN public.profiles.access_blocked_at IS
  'SUP-308: quando o sistema bloqueou a entrada por rescisão (só estes são desbloqueados pelo sistema).';

-- Só a gestão autoriza acesso; ninguém mexe à mão em access_blocked_at.
CREATE OR REPLACE FUNCTION public._profiles_access_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.access_authorized_until IS DISTINCT FROM OLD.access_authorized_until
     AND auth.uid() IS NOT NULL
     AND NOT public.is_super_admin(auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles caller
       JOIN public.user_roles tgt ON tgt.company_id = caller.company_id
       WHERE caller.user_id = auth.uid() AND caller.role IN ('manager', 'owner')
         AND tgt.user_id = NEW.id AND caller.user_id <> NEW.id) THEN
    RAISE EXCEPTION 'Só a gestão pode autorizar o acesso após a rescisão.';
  END IF;
  IF NEW.access_blocked_at IS DISTINCT FROM OLD.access_blocked_at
     AND COALESCE(current_setting('omnibiz.access_sync', true), '') <> '1' THEN
    NEW.access_blocked_at := OLD.access_blocked_at;
  END IF;
  RETURN NEW;
END
$f$;
CREATE TRIGGER trg_profiles_access_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._profiles_access_guard();

-- Aplica (ou retira) o bloqueio de entrada de UMA pessoa.
CREATE OR REPLACE FUNCTION public.employee_apply_access(_uid uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  p public.profiles%ROWTYPE;
  v_block boolean;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = _uid;
  IF NOT FOUND THEN RETURN 'sem_perfil'; END IF;
  v_block := p.termination_date IS NOT NULL
             AND p.termination_date <= current_date
             AND (p.access_authorized_until IS NULL OR p.access_authorized_until < current_date)
             AND NOT public.is_super_admin(_uid);
  IF v_block AND p.access_blocked_at IS NULL THEN
    UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = _uid;
    DELETE FROM auth.sessions WHERE user_id = _uid;
    PERFORM set_config('omnibiz.access_sync', '1', true);
    UPDATE public.profiles SET access_blocked_at = now() WHERE id = _uid;
    PERFORM set_config('omnibiz.access_sync', '', true);
    RETURN 'bloqueado';
  ELSIF NOT v_block AND p.access_blocked_at IS NOT NULL THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = _uid;
    PERFORM set_config('omnibiz.access_sync', '1', true);
    UPDATE public.profiles SET access_blocked_at = NULL WHERE id = _uid;
    PERFORM set_config('omnibiz.access_sync', '', true);
    RETURN 'desbloqueado';
  END IF;
  RETURN 'sem_mudanca';
END
$f$;
REVOKE ALL ON FUNCTION public.employee_apply_access(uuid) FROM PUBLIC, anon, authenticated;

-- Ao gravar a data de rescisão ou a autorização, o efeito é imediato.
CREATE OR REPLACE FUNCTION public._profiles_access_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  PERFORM public.employee_apply_access(NEW.id);
  RETURN NULL;
END
$f$;
CREATE TRIGGER trg_profiles_access_after
  AFTER UPDATE OF termination_date, access_authorized_until ON public.profiles
  FOR EACH ROW
  WHEN (OLD.termination_date IS DISTINCT FROM NEW.termination_date
        OR OLD.access_authorized_until IS DISTINCT FROM NEW.access_authorized_until)
  EXECUTE FUNCTION public._profiles_access_after();

-- Tarefa diária: bloqueios que começam hoje, autorizações que acabaram e
-- passagem a Inativo depois do período de visibilidade da empresa.
CREATE OR REPLACE FUNCTION public.employee_terminations_daily()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  r record;
  v_blocked int := 0;
  v_unblocked int := 0;
  v_inactive int := 0;
  v_res text;
BEGIN
  FOR r IN SELECT id FROM public.profiles
           WHERE termination_date IS NOT NULL OR access_blocked_at IS NOT NULL LOOP
    v_res := public.employee_apply_access(r.id);
    IF v_res = 'bloqueado' THEN v_blocked := v_blocked + 1; END IF;
    IF v_res = 'desbloqueado' THEN v_unblocked := v_unblocked + 1; END IF;
  END LOOP;

  WITH upd AS (
    UPDATE public.profiles p
       SET is_active = false, status = 'inativo'
     WHERE p.termination_date IS NOT NULL
       AND COALESCE(p.is_active, true)
       AND lower(COALESCE(p.status, 'ativo')) <> 'inativo'
       AND p.termination_date + COALESCE(
             (SELECT s.termination_grace_days FROM public.company_hr_settings s
               WHERE s.company_id = p.company_id_primary), 45) < current_date
    RETURNING 1)
  SELECT count(*) INTO v_inactive FROM upd;

  RETURN jsonb_build_object('bloqueados', v_blocked, 'desbloqueados', v_unblocked, 'inativados', v_inactive);
END
$f$;
REVOKE ALL ON FUNCTION public.employee_terminations_daily() FROM PUBLIC, anon, authenticated;

-- O próprio utilizador: "estou bloqueado?" (para o ecrã terminar a sessão já).
CREATE OR REPLACE FUNCTION public.my_access_blocked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT COALESCE((
    SELECT p.termination_date IS NOT NULL
       AND p.termination_date <= current_date
       AND (p.access_authorized_until IS NULL OR p.access_authorized_until < current_date)
       AND NOT public.is_super_admin(p.id)
    FROM public.profiles p WHERE p.id = auth.uid()), false)
$f$;
GRANT EXECUTE ON FUNCTION public.my_access_blocked() TO authenticated;

SELECT cron.schedule('employee-terminations-daily', '20 2 * * *', 'SELECT public.employee_terminations_daily()');

COMMIT;

SELECT jsonb_build_object(
  'dias_padrao', (SELECT column_default FROM information_schema.columns
                  WHERE table_name = 'company_hr_settings' AND column_name = 'termination_grace_days'),
  'tarefa_diaria', EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'employee-terminations-daily'),
  'primeira_execucao', public.employee_terminations_daily()
)::text AS resultado;
