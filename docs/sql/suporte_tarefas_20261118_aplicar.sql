-- =====================================================================
-- OmniBiz · 18/11/2026 — Tickets V-clean (lote 1)
-- Desfazer: suporte_tarefas_20261118_desfazer.sql
--
-- SUP-298  Ticket novo: gestores recebiam DUAS notificações ("Novo ticket"
--          e "Novo ticket destinado a …") quando a fila de destino recai
--          nos gestores (ex.: Secretária sem titular). Agora só uma.
-- SUP-310  Destinos "Léa" e "Luc" só para o Grupo V-clean (não tratam no
--          programa: ninguém é notificado por esses destinos; serve para o
--          funcionário saber para onde o tema foi).
-- SUP-236  Ao reencaminhar o ticket, quem o abriu (funcionário) é avisado.
-- SUP-330  Ausência automática só 24 h depois do início da tarefa (antes:
--          1 h), igual ao que o ecrã já mostra ("atrasada" até lá). O gestor
--          continua a poder marcar falta quando quiser.
-- Nada de dados existentes muda (só são acrescentados os 2 destinos).
-- =====================================================================
BEGIN;

DO $guard$
DECLARE c text; s text; w text;
  cnt int;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'suporte_tarefas_20261118') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  c := pg_get_functiondef('public.create_support_ticket'::regproc);
  s := pg_get_functiondef('public.support_set_ticket_destination'::regproc);
  w := pg_get_functiondef('public.tasks_sweep_absent'::regproc);
  IF position('IF v_created_by_role IN (''employee'',''manager'') THEN' IN c) = 0
     OR position('ELSIF v_created_by_role = ''super_admin'' THEN' IN c) = 0
     OR position('WHERE code = COALESCE(NULLIF(_destination_code, ''''), ''tech'') AND is_active;' IN c) = 0 THEN
    RAISE EXCEPTION 'PARAR: create_support_ticket não está como esperado. Nada foi alterado.';
  END IF;
  IF position('WHERE code = _destination_code AND is_active;' IN s) = 0
     OR position(E'END;\n$function$' IN s) = 0 THEN
    RAISE EXCEPTION 'PARAR: support_set_ticket_destination não está como esperado. Nada foi alterado.';
  END IF;
  IF position('AND now() >= public.task_absence_allowed_at(t.scheduled_for, t.recurrence_date, t.due_at)' IN w) = 0 THEN
    RAISE EXCEPTION 'PARAR: tasks_sweep_absent não está como esperado. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.support_destinations WHERE code IN ('lea','luc')) THEN
    RAISE EXCEPTION 'PARAR: já existem destinos lea/luc. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c') THEN
    RAISE EXCEPTION 'PARAR: empresa Grupo V-clean não encontrada. Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'suporte_tarefas_20261118', p::text, pg_get_functiondef(p), md5(pg_get_functiondef(p))
FROM unnest(ARRAY['public.create_support_ticket'::regproc::regprocedure,
                  'public.support_set_ticket_destination'::regproc::regprocedure,
                  'public.tasks_sweep_absent'::regproc::regprocedure]) p;

-- SUP-310: destinos por empresa -------------------------------------------
ALTER TABLE public.support_destinations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
COMMENT ON COLUMN public.support_destinations.company_id IS
  'SUP-310: destino só desta empresa (NULL = todas as empresas).';
INSERT INTO public.support_destinations
  (code, label, description, icon, target_role, is_technical, sort_order, is_active, company_id)
VALUES
  ('lea', 'Léa', 'Tema passado para a Léa (tratado fora do programa).', 'Users', NULL, false, 40, true,
   '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'),
  ('luc', 'Luc', 'Tema passado para o Luc (tratado fora do programa).', 'Users', NULL, false, 50, true,
   '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c');

-- SUP-298: o destino já avisa os gestores? ---------------------------------
CREATE OR REPLACE FUNCTION public._support_dest_reaches_managers(_company_id uuid, _code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT COALESCE((
    SELECT CASE
      WHEN d.is_technical OR d.target_role IS NULL THEN false
      WHEN d.target_role = 'manager' THEN true
      ELSE NOT EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.role::text = d.target_role AND ur.company_id = _company_id)
    END
    FROM public.support_destinations d WHERE d.code = _code), false)
$f$;

DO $apply$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.create_support_ticket'::regproc);
  d := replace(d, 'IF v_created_by_role IN (''employee'',''manager'') THEN',
    'IF v_created_by_role IN (''employee'',''manager'') AND NOT public._support_dest_reaches_managers(new_ticket.company_id, v_dest.code) THEN -- SUP-298');
  d := replace(d, 'ELSIF v_created_by_role = ''super_admin'' THEN',
    'ELSIF v_created_by_role = ''super_admin'' AND NOT public._support_dest_reaches_managers(new_ticket.company_id, v_dest.code) THEN -- SUP-298');
  d := replace(d, 'WHERE code = COALESCE(NULLIF(_destination_code, ''''), ''tech'') AND is_active;',
    'WHERE code = COALESCE(NULLIF(_destination_code, ''''), ''tech'') AND is_active AND (company_id IS NULL OR company_id = _company_id); -- SUP-310');
  EXECUTE d;

  d := pg_get_functiondef('public.support_set_ticket_destination'::regproc);
  d := replace(d, 'WHERE code = _destination_code AND is_active;',
    'WHERE code = _destination_code AND is_active AND (company_id IS NULL OR company_id = t.company_id); -- SUP-310');
  d := replace(d, E'END;\n$function$', $blk$
  -- SUP-236: quem abriu o ticket (funcionário) é avisado do reencaminhamento.
  IF t.requester_user_id IS NOT NULL
     AND t.requester_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_company_manager(t.requester_user_id, t.company_id) THEN
    BEGIN
      PERFORM public._notify(
        t.company_id, t.requester_user_id, NULL,
        'ticket_updated'::public.notification_event,
        'O seu ticket foi encaminhado · ' || t.ticket_number,
        t.title || ' → ' || d.label,
        'media'::public.notification_priority,
        jsonb_build_object('ticket_id', _ticket_id, 'destination_code', d.code,
                           'link', '/app/suporte/' || _ticket_id::text));
    EXCEPTION WHEN others THEN
      RAISE WARNING 'support_set_ticket_destination: aviso ao requerente falhou: %', SQLERRM;
    END;
  END IF;
END;
$function$$blk$);
  EXECUTE d;

  d := pg_get_functiondef('public.tasks_sweep_absent'::regproc);
  d := replace(d, 'AND now() >= public.task_absence_allowed_at(t.scheduled_for, t.recurrence_date, t.due_at)',
    'AND now() >= CASE WHEN t.scheduled_for IS NOT NULL THEN t.scheduled_for + interval ''24 hours'' -- SUP-330
                       ELSE public.task_absence_allowed_at(t.scheduled_for, t.recurrence_date, t.due_at) END');
  EXECUTE d;
END
$apply$;

COMMIT;

SELECT jsonb_build_object(
  'sup298_uma_notificacao', position('_support_dest_reaches_managers' IN pg_get_functiondef('public.create_support_ticket'::regproc)) > 0,
  'sup310_destinos', (SELECT string_agg(label, ', ' ORDER BY sort_order) FROM public.support_destinations WHERE company_id IS NOT NULL),
  'sup236_avisa_funcionario', position('SUP-236' IN pg_get_functiondef('public.support_set_ticket_destination'::regproc)) > 0,
  'sup330_ausencia_24h', position('SUP-330' IN pg_get_functiondef('public.tasks_sweep_absent'::regproc)) > 0
)::text AS resultado;
