
-- 1) Profile operational fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS work_location text,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid,
  ADD COLUMN IF NOT EXISTS team text;

-- Trigger to prevent non-managers from editing operational fields
CREATE OR REPLACE FUNCTION public.profiles_guard_operational_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := COALESCE(NEW.current_company_id, OLD.current_company_id);
  v_is_manager boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  -- Allow super admin / managers freely
  IF public.is_super_admin(v_uid) THEN RETURN NEW; END IF;
  IF v_company IS NOT NULL THEN
    v_is_manager := public.is_company_manager(v_uid, v_company);
  END IF;
  IF v_is_manager THEN RETURN NEW; END IF;

  -- Non-manager editing own profile: block changes to operational fields
  IF NEW.job_title IS DISTINCT FROM OLD.job_title
     OR NEW.work_location IS DISTINCT FROM OLD.work_location
     OR NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id
     OR NEW.team IS DISTINCT FROM OLD.team THEN
    NEW.job_title := OLD.job_title;
    NEW.work_location := OLD.work_location;
    NEW.supervisor_id := OLD.supervisor_id;
    NEW.team := OLD.team;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_guard_operational ON public.profiles;
CREATE TRIGGER trg_profiles_guard_operational
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_operational_fields();

-- 2) Vacation request: operational context
ALTER TABLE public.vacation_requests
  ADD COLUMN IF NOT EXISTS work_location text,
  ADD COLUMN IF NOT EXISTS prior_validation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validated_by text;

-- Auto snapshot work_location from profile + validate "validated_by" requirement
CREATE OR REPLACE FUNCTION public.vacation_fill_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.work_location IS NULL THEN
      SELECT work_location INTO NEW.work_location
      FROM public.profiles WHERE id = NEW.user_id;
    END IF;
  END IF;

  IF NEW.prior_validation IS TRUE THEN
    IF NEW.validated_by IS NULL OR length(trim(NEW.validated_by)) = 0 THEN
      RAISE EXCEPTION 'Informe quem realizou a validação prévia';
    END IF;
  ELSE
    NEW.validated_by := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vacation_fill_context ON public.vacation_requests;
CREATE TRIGGER trg_vacation_fill_context
BEFORE INSERT OR UPDATE ON public.vacation_requests
FOR EACH ROW EXECUTE FUNCTION public.vacation_fill_context();
