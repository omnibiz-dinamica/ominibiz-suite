ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text, ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.profiles SET
  first_name = NULLIF(split_part(btrim(full_name), ' ', 1), ''),
  last_name = NULLIF(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), '')
WHERE full_name IS NOT NULL AND first_name IS NULL AND last_name IS NULL;

CREATE OR REPLACE FUNCTION public.profiles_sync_name_parts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.first_name IS NULL AND NEW.last_name IS NULL AND NEW.full_name IS NOT NULL
     OR TG_OP = 'UPDATE' AND NEW.full_name IS DISTINCT FROM OLD.full_name
        AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name THEN
    NEW.first_name := NULLIF(split_part(btrim(coalesce(NEW.full_name,'')), ' ', 1), '');
    NEW.last_name := NULLIF(btrim(substr(btrim(coalesce(NEW.full_name,'')), length(split_part(btrim(coalesce(NEW.full_name,'')), ' ', 1)) + 1)), '');
  ELSIF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
    NEW.first_name := NULLIF(btrim(NEW.first_name), '');
    NEW.last_name := NULLIF(btrim(NEW.last_name), '');
    NEW.full_name := NULLIF(btrim(concat_ws(' ', NEW.first_name, NEW.last_name)), '');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_sync_name_parts ON public.profiles;
CREATE TRIGGER trg_profiles_sync_name_parts BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_name_parts();