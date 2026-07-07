
-- 1) Recriar admin_create_company_with_invite para retornar invite_id
DROP FUNCTION IF EXISTS public.admin_create_company_with_invite(text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_create_company_with_invite(
  _name text, _slug text, _country text, _currency text,
  _language text, _timezone text, _admin_email text
)
RETURNS TABLE(company_id uuid, invite_id uuid, invite_token text, invite_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_invite_id UUID;
  v_token TEXT;
  v_email TEXT := lower(trim(_admin_email));
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas super admin pode criar empresas';
  END IF;

  INSERT INTO public.companies (name, slug, country, currency, language, timezone, status, created_by)
  VALUES (_name, _slug, _country, _currency, _language, _timezone, 'active', auth.uid())
  RETURNING id INTO v_company_id;

  INSERT INTO public.invites (company_id, email, role, invited_by)
  VALUES (v_company_id, v_email, 'manager', auth.uid())
  RETURNING id, token INTO v_invite_id, v_token;

  INSERT INTO public.tasks (company_id, title, description, status, priority, created_by)
  VALUES (
    v_company_id,
    'Bem-vindo ao OmniBiz',
    'Convide sua equipe em "Equipe" e crie suas primeiras tarefas operacionais.',
    'pendente', 'media', auth.uid()
  );

  RETURN QUERY SELECT v_company_id, v_invite_id, v_token, v_email;
END $function$;

-- 2) admin_replace_manager_invite — trocar o email de um convite pendente
CREATE OR REPLACE FUNCTION public.admin_replace_manager_invite(
  _invite_id uuid, _new_email text
)
RETURNS TABLE(id uuid, email text, token text, role app_role, expires_at timestamptz, company_id uuid, send_count integer, last_sent_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  old_inv public.invites%ROWTYPE;
  new_inv public.invites%ROWTYPE;
  v_new_email text := lower(trim(_new_email));
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: apenas super admin';
  END IF;
  IF v_new_email IS NULL OR v_new_email = '' OR v_new_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;

  SELECT * INTO old_inv FROM public.invites WHERE invites.id = _invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite não encontrado'; END IF;
  IF old_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Só é possível alterar email de convites pendentes';
  END IF;

  UPDATE public.invites SET status = 'revoked' WHERE invites.id = _invite_id;

  INSERT INTO public.invites (company_id, email, role, invited_by)
  VALUES (old_inv.company_id, v_new_email, old_inv.role, auth.uid())
  RETURNING * INTO new_inv;

  RETURN QUERY SELECT new_inv.id, new_inv.email, new_inv.token, new_inv.role,
                      new_inv.expires_at, new_inv.company_id, new_inv.send_count, new_inv.last_sent_at;
END $function$;

-- 3) admin_revoke_user_from_company — remover vínculos operacionais de um utilizador numa empresa
CREATE OR REPLACE FUNCTION public.admin_revoke_user_from_company(
  _email text, _company_id uuid
)
RETURNS TABLE(user_id uuid, roles_removed integer, invites_revoked integer, profile_cleared boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_email text := lower(trim(_email));
  v_roles int := 0;
  v_invites int := 0;
  v_profile_cleared boolean := false;
  v_owner_count int;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: apenas super admin';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado para o email %', v_email;
  END IF;

  -- Proteção: não remover o único owner
  SELECT count(*) INTO v_owner_count
  FROM public.user_roles
  WHERE company_id = _company_id AND role = 'owner';

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND company_id = _company_id AND role = 'owner'
  ) AND v_owner_count <= 1 THEN
    RAISE EXCEPTION 'Não é possível remover: usuário é o único owner da empresa';
  END IF;

  WITH deleted AS (
    DELETE FROM public.user_roles
    WHERE user_id = v_user_id AND company_id = _company_id
    RETURNING 1
  ) SELECT count(*) INTO v_roles FROM deleted;

  WITH updated AS (
    UPDATE public.invites
    SET status = 'revoked'
    WHERE lower(email) = v_email
      AND company_id = _company_id
      AND status IN ('pending','accepted')
    RETURNING 1
  ) SELECT count(*) INTO v_invites FROM updated;

  UPDATE public.profiles
  SET current_company_id = NULL,
      company_id_primary = CASE WHEN company_id_primary = _company_id THEN NULL ELSE company_id_primary END
  WHERE id = v_user_id AND current_company_id = _company_id;
  GET DIAGNOSTICS v_profile_cleared = ROW_COUNT;

  RETURN QUERY SELECT v_user_id, v_roles, v_invites, v_profile_cleared;
END $function$;

REVOKE ALL ON FUNCTION public.admin_create_company_with_invite(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_company_with_invite(text,text,text,text,text,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_replace_manager_invite(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_replace_manager_invite(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_revoke_user_from_company(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_from_company(text, uuid) TO authenticated;
