
DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    '02eb6cf4-a512-4e21-be27-3ad87e4c0dcf',
    'd3b367fa-5f9d-4254-bde4-a5d355365b4f',
    '07800206-704a-4d58-a56a-b1a3c9c2616d',
    '74040103-85d6-4dd9-ac41-844d1e1074cf',
    'dfaae66f-00be-482d-b8e5-b70d43cca653'
  ]::uuid[];
  v_emails text[] := ARRAY[
    'letrasmodestas@hotmail.com',
    'edurts.83@gmail.com',
    'marco.kazuyamishima@gmail.com',
    'lacosinocentes@gmail.com',
    'clara.lribeiro08@gmail.com'
  ];
  v_uid uuid;
  v_new_email text;
  v_invites_revoked int := 0;
  v_profiles_updated int := 0;
  v_roles_deleted int := 0;
  v_users_renamed int := 0;
  v_identities_renamed int := 0;
  v_tmp int;
BEGIN
  UPDATE public.invites
     SET status = 'revoked'
   WHERE lower(email) = ANY (SELECT lower(unnest(v_emails)))
     AND status IN ('pending','accepted');
  GET DIAGNOSTICS v_invites_revoked = ROW_COUNT;

  DELETE FROM public.user_roles WHERE user_id = ANY(v_ids);
  GET DIAGNOSTICS v_roles_deleted = ROW_COUNT;

  UPDATE public.profiles
     SET is_active = false,
         current_company_id = NULL,
         updated_at = now()
   WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_profiles_updated = ROW_COUNT;

  FOREACH v_uid IN ARRAY v_ids LOOP
    v_new_email := 'retired+' || v_uid::text || '@homologacao.invalid';

    UPDATE auth.users
       SET email = v_new_email,
           email_change = NULL,
           email_change_token_new = '',
           email_change_token_current = '',
           updated_at = now()
     WHERE id = v_uid;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_users_renamed := v_users_renamed + v_tmp;

    UPDATE auth.identities
       SET identity_data = jsonb_set(
             COALESCE(identity_data, '{}'::jsonb),
             '{email}',
             to_jsonb(v_new_email),
             true
           ),
           updated_at = now()
     WHERE user_id = v_uid
       AND provider = 'email';
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_identities_renamed := v_identities_renamed + v_tmp;
  END LOOP;

  RAISE NOTICE 'Liberacao concluida: invites_revoked=%, roles_deleted=%, profiles_updated=%, users_renamed=%, identities_renamed=%',
    v_invites_revoked, v_roles_deleted, v_profiles_updated, v_users_renamed, v_identities_renamed;
END $$;
