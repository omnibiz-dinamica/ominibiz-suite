
-- Managers can update profiles of users in their company
CREATE POLICY "managers update company profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (current_company_id IS NOT NULL AND public.is_company_manager(auth.uid(), current_company_id))
WITH CHECK (current_company_id IS NOT NULL AND public.is_company_manager(auth.uid(), current_company_id));

-- Set a member's role within a company (manager/employee only)
CREATE OR REPLACE FUNCTION public.set_member_role(_user_id uuid, _company_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_company_manager(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Apenas gestores podem alterar papéis';
  END IF;
  IF _role = 'super_admin' THEN
    RAISE EXCEPTION 'Não é possível atribuir super_admin';
  END IF;

  DELETE FROM public.user_roles
   WHERE user_id = _user_id AND company_id = _company_id AND role <> 'super_admin';

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (_user_id, _company_id, _role)
  ON CONFLICT DO NOTHING;
END $$;

-- Remove a member from a company
CREATE OR REPLACE FUNCTION public.remove_member(_user_id uuid, _company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_company_manager(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Apenas gestores podem remover membros';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode remover a si mesmo';
  END IF;

  DELETE FROM public.user_roles
   WHERE user_id = _user_id AND company_id = _company_id AND role <> 'super_admin';

  UPDATE public.profiles
     SET current_company_id = NULL
   WHERE id = _user_id AND current_company_id = _company_id;
END $$;
