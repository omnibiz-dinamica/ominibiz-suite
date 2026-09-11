DO $$
DECLARE
  v_src uuid := '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c';
  v_new uuid;
BEGIN
  SELECT id INTO v_new FROM public.companies WHERE slug = 'grupo-v-clean-teste';
  IF v_new IS NOT NULL THEN
    RAISE NOTICE 'Clone already present: %', v_new;
    RETURN;
  END IF;

  v_new := gen_random_uuid();

  INSERT INTO public.companies
  SELECT r.* FROM public.companies c
  CROSS JOIN LATERAL jsonb_populate_record(
    NULL::public.companies,
    to_jsonb(c) || jsonb_build_object(
      'id', v_new,
      'name', 'Grupo V-clean TESTE',
      'slug', 'grupo-v-clean-teste',
      'created_at', now(),
      'updated_at', now()
    )
  ) AS r
  WHERE c.id = v_src;

  INSERT INTO public.company_hr_settings
  SELECT r.* FROM public.company_hr_settings s
  CROSS JOIN LATERAL jsonb_populate_record(
    NULL::public.company_hr_settings,
    to_jsonb(s) || jsonb_build_object('id', gen_random_uuid(), 'company_id', v_new)
  ) AS r
  WHERE s.company_id = v_src;

  INSERT INTO public.user_roles (user_id, company_id, role)
  SELECT ur.user_id, v_new, ur.role
  FROM public.user_roles ur
  WHERE ur.company_id = v_src
  ON CONFLICT DO NOTHING;

  CREATE TEMP TABLE _clone_client_map(old uuid PRIMARY KEY, new uuid NOT NULL) ON COMMIT DROP;
  INSERT INTO _clone_client_map(old, new)
  SELECT id, gen_random_uuid() FROM public.clients WHERE company_id = v_src;

  INSERT INTO public.clients
  SELECT r.* FROM public.clients c
  JOIN _clone_client_map m ON m.old = c.id
  CROSS JOIN LATERAL jsonb_populate_record(
    NULL::public.clients,
    to_jsonb(c) || jsonb_build_object('id', m.new, 'company_id', v_new)
  ) AS r;

  INSERT INTO public.client_assignees
  SELECT r.* FROM public.client_assignees a
  JOIN _clone_client_map m ON m.old = a.client_id
  CROSS JOIN LATERAL jsonb_populate_record(
    NULL::public.client_assignees,
    to_jsonb(a) || jsonb_build_object('id', gen_random_uuid(), 'company_id', v_new, 'client_id', m.new)
  ) AS r;

  INSERT INTO public.task_recurrences
  SELECT r.* FROM public.task_recurrences tr
  LEFT JOIN _clone_client_map m ON m.old = tr.client_id
  CROSS JOIN LATERAL jsonb_populate_record(
    NULL::public.task_recurrences,
    to_jsonb(tr) || jsonb_build_object(
      'id', gen_random_uuid(),
      'company_id', v_new,
      'client_id', m.new,
      'status', 'paused'
    )
  ) AS r
  WHERE tr.company_id = v_src;

  RAISE NOTICE 'Clone created: %', v_new;
END
$$;