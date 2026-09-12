-- Isolamento das identidades: producao (Grupo V-clean) x teste (Grupo V-clean TESTE).
DO $$
DECLARE
  c_test uuid := '9f014b54-bd55-4dca-a7ea-ac049c4e560d';
  prod_edu uuid := '5c5025cd-5a82-412e-ae92-6b4ba67ade21';
  prod_kei uuid := '9605ac34-106f-4297-8227-111a57d9288b';
  test_edu uuid := '11d14f26-480a-4b02-9105-e72356416075';
  test_kei uuid := '119f5671-f9a8-4dd3-8e14-b44db63cc1a5';
BEGIN
  UPDATE public.profiles SET full_name = 'Eduardo R S Junior TESTE', is_active = true,
         current_company_id = c_test, company_id_primary = c_test WHERE id = test_edu;
  UPDATE public.profiles SET full_name = 'Keila Oliveira TESTE', is_active = true,
         current_company_id = c_test, company_id_primary = c_test WHERE id = test_kei;

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (test_edu, c_test, 'manager'), (test_kei, c_test, 'employee')
  ON CONFLICT (user_id, company_id, role) DO NOTHING;

  PERFORM set_config('omnibiz.task_rpc', 'on', true);
  UPDATE public.tasks SET assigned_to = test_edu WHERE company_id = c_test AND assigned_to = prod_edu;
  UPDATE public.tasks SET assigned_to = test_kei WHERE company_id = c_test AND assigned_to = prod_kei;
  PERFORM set_config('omnibiz.task_rpc', 'off', true);

  UPDATE public.task_recurrences SET assigned_to = test_edu WHERE company_id = c_test AND assigned_to = prod_edu;
  UPDATE public.task_recurrences SET assigned_to = test_kei WHERE company_id = c_test AND assigned_to = prod_kei;

  UPDATE public.client_assignees SET user_id = test_edu WHERE company_id = c_test AND user_id = prod_edu;
  UPDATE public.client_assignees SET user_id = test_kei WHERE company_id = c_test AND user_id = prod_kei;

  DELETE FROM public.user_roles WHERE company_id = c_test AND user_id IN (prod_edu, prod_kei);
END $$;