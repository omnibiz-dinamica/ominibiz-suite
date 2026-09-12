-- ADR-062 — isolamento absoluto do ambiente de teste.
-- Escopo restrito a company_id = Grupo V-clean TESTE. Nenhuma linha de produção
-- é lida para escrita nem alterada.
DO $$
DECLARE
  v_test_company uuid := '9f014b54-bd55-4dca-a7ea-ac049c4e560d';
  v_test_employee uuid := '119f5671-f9a8-4dd3-8e14-b44db63cc1a5'; -- Keila Oliveira TESTE
  v_test_manager uuid := '11d14f26-480a-4b02-9105-e72356416075'; -- Eduardo R S Junior TESTE
BEGIN
  -- 1. Reatribui, apenas dentro da empresa de teste, tudo que apontava para
  --    identidades de produção.
  UPDATE public.tasks t
     SET assigned_to = v_test_employee
   WHERE t.company_id = v_test_company
     AND t.assigned_to IS NOT NULL
     AND t.assigned_to NOT IN (v_test_employee, v_test_manager);

  UPDATE public.tasks t
     SET created_by = v_test_manager
   WHERE t.company_id = v_test_company
     AND t.created_by IS NOT NULL
     AND t.created_by NOT IN (v_test_employee, v_test_manager);

  -- Séries recorrentes: remapear uma a uma. Quando o remapeamento criaria uma
  -- série activa duplicada (guarda `task_recurrences_block_duplicate_active`),
  -- a série é pausada em vez de eliminada — histórico preservado.
  DECLARE
    v_rec record;
  BEGIN
    FOR v_rec IN
      SELECT id FROM public.task_recurrences
       WHERE company_id = v_test_company
         AND assigned_to IS NOT NULL
         AND assigned_to NOT IN (v_test_employee, v_test_manager)
    LOOP
      BEGIN
        UPDATE public.task_recurrences
           SET assigned_to = v_test_employee
         WHERE id = v_rec.id;
      EXCEPTION WHEN others THEN
        UPDATE public.task_recurrences
           SET status = 'paused', assigned_to = v_test_employee
         WHERE id = v_rec.id;
      END;
    END LOOP;
  END;

  -- Cada cliente da empresa de teste passa a ter a executante de teste.
  INSERT INTO public.client_assignees (company_id, client_id, user_id)
  SELECT DISTINCT ca.company_id, ca.client_id, v_test_employee
    FROM public.client_assignees ca
   WHERE ca.company_id = v_test_company
     AND ca.user_id NOT IN (v_test_employee, v_test_manager)
     AND NOT EXISTS (
       SELECT 1 FROM public.client_assignees dup
        WHERE dup.client_id = ca.client_id
          AND dup.user_id = v_test_employee
     );

  DELETE FROM public.client_assignees ca
   WHERE ca.company_id = v_test_company
     AND ca.user_id NOT IN (v_test_employee, v_test_manager);

  -- 2. Remove o acesso das identidades de produção à empresa de teste.
  DELETE FROM public.user_roles ur
   WHERE ur.company_id = v_test_company
     AND ur.user_id NOT IN (v_test_employee, v_test_manager);

  -- 3. Nenhum perfil de produção pode ter a empresa de teste como contexto.
  UPDATE public.profiles p
     SET current_company_id = NULL
   WHERE p.current_company_id = v_test_company
     AND p.id NOT IN (v_test_employee, v_test_manager);

  UPDATE public.profiles p
     SET company_id_primary = NULL
   WHERE p.company_id_primary = v_test_company
     AND p.id NOT IN (v_test_employee, v_test_manager);
END $$;