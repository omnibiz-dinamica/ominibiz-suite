-- =====================================================================
-- OmniBiz · 22/11/2026 — Quem abriu o ticket pode reabri-lo
-- Hoje só gestão/Super Admin reabre (reopen_support_ticket_with_message →
-- "not_authorized" para o funcionário). Nova RPC só para o SOLICITANTE:
--   • ticket encerrado (resolvido / fechado / rejeitado / resolvido pelo gestor);
--   • mensagem obrigatória (fica na conversa);
--   • volta para a mesma fila (destination_code) em "Em análise pelo gestor",
--     sem responsável atribuído, desarquivado;
--   • regista no histórico do ticket e avisa a fila de destino (ou a gestão).
-- A proteção de campos (support_tickets_prevent_forbidden_updates) ganha só
-- esta exceção. Não altera outras RPCs nem dados.
-- Desfazer: suporte_reabrir_pelo_solicitante_20261122_desfazer.sql
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.support_requester_reopen(uuid,text)') IS NOT NULL
     OR to_regclass('public._omnibiz_fn_backup_20261122_reopen') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
END
$guard$;


-- Cópia da função de proteção atual (para o script de desfazer).
CREATE TABLE public._omnibiz_fn_backup_20261122_reopen AS
SELECT 'support_tickets_prevent_forbidden_updates()'::text AS fn,
       pg_get_functiondef('public.support_tickets_prevent_forbidden_updates()'::regprocedure) AS def,
       now() AS saved_at;
ALTER TABLE public._omnibiz_fn_backup_20261122_reopen ENABLE ROW LEVEL SECURITY;

-- Proteção igual à atual + UMA exceção: a reabertura feita pela RPC
-- support_requester_reopen (marca de transação), só pelo próprio solicitante,
-- só de ticket encerrado para "Em análise pelo gestor".
CREATE OR REPLACE FUNCTION public.support_tickets_prevent_forbidden_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  v_is_mgr boolean;
  v_is_employee boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  v_is_sa := public.is_super_admin(v_uid);
  v_is_mgr := public.is_company_manager(v_uid, OLD.company_id);
  v_is_employee := NOT v_is_sa AND NOT v_is_mgr;
  -- Ninguém troca company_id
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id_immutable' USING ERRCODE = '42501';
  END IF;
  -- 22/11/2026: reabertura pelo solicitante (só via support_requester_reopen).
  IF v_is_employee
     AND COALESCE(current_setting('omnibiz.support_requester_reopen', true), '') = OLD.id::text
     AND OLD.requester_user_id = v_uid
     AND OLD.status::text IN ('resolvido','fechado','rejeitado','resolved_by_manager')
     AND NEW.status::text = 'under_manager_review'
     AND NEW.priority IS NOT DISTINCT FROM OLD.priority
     AND NEW.escalated_to_super_admin IS NOT DISTINCT FROM OLD.escalated_to_super_admin
     AND NEW.created_by_role IS NOT DISTINCT FROM OLD.created_by_role THEN
    RETURN NEW;
  END IF;
  IF v_is_employee THEN
    IF NEW.support_level IS DISTINCT FROM OLD.support_level
       OR NEW.current_owner_role IS DISTINCT FROM OLD.current_owner_role
       OR NEW.escalated_to_super_admin IS DISTINCT FROM OLD.escalated_to_super_admin
       OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.escalated_at IS DISTINCT FROM OLD.escalated_at
       OR NEW.escalated_by IS DISTINCT FROM OLD.escalated_by
       OR NEW.returned_to_manager_at IS DISTINCT FROM OLD.returned_to_manager_at
       OR NEW.returned_to_manager_by IS DISTINCT FROM OLD.returned_to_manager_by
       OR NEW.created_by_role IS DISTINCT FROM OLD.created_by_role THEN
      RAISE EXCEPTION 'employee_cannot_update_sensitive_fields' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.support_requester_reopen(_ticket_id uuid, _message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_uid uuid := auth.uid();
  t public.support_tickets%ROWTYPE;
  v_msg uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;
  IF t.requester_user_id IS DISTINCT FROM v_uid OR NOT public.is_company_member(v_uid, t.company_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF t.status::text NOT IN ('resolvido','fechado','rejeitado','resolved_by_manager') THEN
    RAISE EXCEPTION 'ticket_not_closed' USING ERRCODE = 'P0001';
  END IF;
  IF _message IS NULL OR btrim(_message) = '' THEN
    RAISE EXCEPTION 'message_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.support_ticket_messages (ticket_id, company_id, author_user_id, message, is_internal)
  VALUES (_ticket_id, t.company_id, v_uid, btrim(_message), false)
  RETURNING id INTO v_msg;

  PERFORM set_config('omnibiz.support_requester_reopen', _ticket_id::text, true);
  UPDATE public.support_tickets SET
    status = 'under_manager_review'::public.support_ticket_status,
    support_level = 'company',
    current_owner_role = 'manager',
    assigned_user_id = NULL,
    closed_at = NULL, closed_by = NULL,
    resolved_at = NULL,
    archived_at = NULL, archived_by = NULL,
    updated_at = now()
  WHERE id = _ticket_id;
  PERFORM set_config('omnibiz.support_requester_reopen', '', true);

  PERFORM public.support_ticket_log_event(
    _ticket_id, t.company_id, 'ticket_reopened',
    jsonb_build_object('status', t.status, 'assigned_user_id', t.assigned_user_id),
    jsonb_build_object('status', 'under_manager_review', 'destination_code', t.destination_code),
    jsonb_build_object('previous_status', t.status, 'new_status', 'under_manager_review',
                       'reopened_by', 'requester', 'reopened_at', now(), 'message', btrim(_message)));

  BEGIN
    IF t.destination_code IS NOT NULL THEN
      PERFORM public.support_notify_destination(
        t.company_id, _ticket_id, t.destination_code,
        'Ticket reaberto pelo funcionário · ' || t.ticket_number, t.title,
        'ticket_reopened'::public.notification_event, 'alta'::public.notification_priority);
    ELSE
      PERFORM public.support_notify_managers(
        t.company_id, _ticket_id,
        'Ticket reaberto pelo funcionário · ' || t.ticket_number, t.title,
        'ticket_reopened'::public.notification_event, 'alta'::public.notification_priority);
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'support_requester_reopen: aviso não enviado para %: %', _ticket_id, SQLERRM;
  END;

  RETURN v_msg;
END
$f$;
REVOKE ALL ON FUNCTION public.support_requester_reopen(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_requester_reopen(uuid, text) TO authenticated;

COMMIT;

SELECT jsonb_build_object('funcao_criada', to_regprocedure('public.support_requester_reopen(uuid,text)') IS NOT NULL,
  'protecao_com_excecao', position('omnibiz.support_requester_reopen' in pg_get_functiondef('public.support_tickets_prevent_forbidden_updates()'::regprocedure)) > 0)::text AS resultado;
