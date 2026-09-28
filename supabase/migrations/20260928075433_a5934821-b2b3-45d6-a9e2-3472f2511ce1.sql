CREATE OR REPLACE FUNCTION public.client_default_assignees(_client_id uuid)
 RETURNS TABLE(user_id uuid, full_name text, is_primary boolean, is_active boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  SELECT c.company_id INTO v_company FROM public.clients c WHERE c.id = _client_id;
  IF v_company IS NULL THEN RETURN; END IF;
  IF NOT (public.is_company_manager(auth.uid(), v_company) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para consultar a equipe do cliente';
  END IF;
  RETURN QUERY
  SELECT ca.user_id, p.full_name, ca.is_primary, true AS is_active
  FROM public.client_assignees ca
  JOIN public.profiles p ON p.id = ca.user_id
  WHERE ca.client_id = _client_id
    AND ca.company_id = v_company
    AND COALESCE(p.is_active, true) = true
    AND lower(COALESCE(p.status, 'ativo')) <> 'inativo'
    AND (p.termination_date IS NULL OR p.termination_date > CURRENT_DATE)
  ORDER BY ca.is_primary DESC, p.full_name NULLS LAST;
END;
$function$;

CREATE TABLE public.client_primary_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  origin text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_primary_audit TO authenticated;
GRANT ALL ON public.client_primary_audit TO service_role;
ALTER TABLE public.client_primary_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read client primary audit" ON public.client_primary_audit
  FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.unlink_primary_on_inactivation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF (COALESCE(NEW.is_active, true) = false OR lower(COALESCE(NEW.status, 'ativo')) = 'inativo'
      OR (NEW.termination_date IS NOT NULL AND NEW.termination_date <= CURRENT_DATE))
     AND NOT (COALESCE(OLD.is_active, true) = false OR lower(COALESCE(OLD.status, 'ativo')) = 'inativo'
      OR (OLD.termination_date IS NOT NULL AND OLD.termination_date <= CURRENT_DATE)) THEN
    WITH changed AS (
      UPDATE public.client_assignees SET is_primary = false
      WHERE user_id = NEW.id AND is_primary = true
      RETURNING company_id, client_id, user_id
    )
    INSERT INTO public.client_primary_audit (company_id, client_id, user_id, origin, actor_id)
    SELECT company_id, client_id, user_id, 'profile_inactivation', auth.uid() FROM changed;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.unlink_primary_on_inactivation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_unlink_primary_on_inactivation
AFTER UPDATE OF is_active, status, termination_date ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.unlink_primary_on_inactivation();