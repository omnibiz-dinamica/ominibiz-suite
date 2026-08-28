-- Setor operacional opcional do colaborador, mantido no perfil para reutilizacao
-- entre a tela de Usuarios e os demais modulos que precisarem filtrar por setor.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sector text;

-- O setor e um dado operacional administrado por gestor. Funcionarios continuam
-- sem permissao para alterar campos operacionais pelo proprio perfil.
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

  IF public.is_super_admin(v_uid) THEN RETURN NEW; END IF;
  IF v_company IS NOT NULL THEN
    v_is_manager := public.is_company_manager(v_uid, v_company);
  END IF;
  IF v_is_manager THEN RETURN NEW; END IF;

  IF NEW.job_title IS DISTINCT FROM OLD.job_title
     OR NEW.work_location IS DISTINCT FROM OLD.work_location
     OR NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id
     OR NEW.team IS DISTINCT FROM OLD.team
     OR NEW.sector IS DISTINCT FROM OLD.sector THEN
    NEW.job_title := OLD.job_title;
    NEW.work_location := OLD.work_location;
    NEW.supervisor_id := OLD.supervisor_id;
    NEW.team := OLD.team;
    NEW.sector := OLD.sector;
  END IF;

  RETURN NEW;
END $$;
