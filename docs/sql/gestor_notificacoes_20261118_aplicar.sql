-- =====================================================================
-- OmniBiz · 18/11/2026 — SUP-2026-000160: o gestor cria notificações.
-- Desfazer: gestor_notificacoes_20261118_desfazer.sql
-- Correr DEPOIS do passo 1 (gestor_notificacoes_20261118_passo1_enum.sql).
--
-- manager_send_notification: gestor/owner/super admin envia uma notificação
-- "formal" (título, texto, prioridade) a pessoas da empresa (funcionários,
-- outros gestores, contabilista…). Opcional: "encaminhar para" alguém fora do
-- programa (Contabilista, Léa, Luc…) — fica nas notificações dos gestores em
-- "Em tratamento › Encaminhada" com essa etiqueta.
-- Só cria notificações; não altera dados existentes.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.manager_send_notification(uuid,uuid[],text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'notification_event' AND e.enumlabel = 'manager_message') THEN
    RAISE EXCEPTION 'PARAR: corra primeiro o passo 1 (gestor_notificacoes_20261118_passo1_enum.sql). Nada foi alterado.';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.manager_send_notification(
  _company_id uuid,
  _user_ids uuid[],
  _title text,
  _body text,
  _priority text DEFAULT 'media',
  _forward_to text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_title text := btrim(COALESCE(_title, ''));
  v_body text := NULLIF(btrim(COALESCE(_body, '')), '');
  v_forward text := NULLIF(btrim(COALESCE(_forward_to, '')), '');
  v_meta jsonb;
  v_name text;
  v_target uuid;
  v_sent int := 0;
  v_skipped int := 0;
  v_mgr uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.is_company_manager(v_uid, _company_id)
          OR public.is_company_owner(v_uid, _company_id)) THEN
    RAISE EXCEPTION 'Só a gestão pode enviar notificações.';
  END IF;
  IF length(v_title) < 3 OR length(v_title) > 120 THEN
    RAISE EXCEPTION 'O título deve ter entre 3 e 120 caracteres.';
  END IF;
  IF v_body IS NOT NULL AND length(v_body) > 2000 THEN
    RAISE EXCEPTION 'A mensagem pode ter no máximo 2000 caracteres.';
  END IF;
  IF COALESCE(_priority, 'media') NOT IN ('baixa', 'media', 'alta', 'urgente') THEN
    RAISE EXCEPTION 'Prioridade inválida.';
  END IF;
  IF v_forward IS NOT NULL AND length(v_forward) > 60 THEN
    RAISE EXCEPTION 'O destino do encaminhamento é demasiado longo.';
  END IF;
  IF COALESCE(array_length(_user_ids, 1), 0) = 0 AND v_forward IS NULL THEN
    RAISE EXCEPTION 'Escolha pelo menos uma pessoa ou para quem encaminhar.';
  END IF;
  IF COALESCE(array_length(_user_ids, 1), 0) > 500 THEN
    RAISE EXCEPTION 'No máximo 500 pessoas por envio.';
  END IF;

  SELECT NULLIF(btrim(full_name), '') INTO v_name FROM public.profiles WHERE id = v_uid;
  v_meta := jsonb_build_object(
    'kind', 'manager_message',
    'message_id', gen_random_uuid(),
    'sent_by', v_uid,
    'sent_by_name', COALESCE(v_name, 'Gestão'),
    'forwarded_to', v_forward);

  FOR v_target IN SELECT DISTINCT u FROM unnest(COALESCE(_user_ids, '{}'::uuid[])) u LOOP
    IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_target AND ur.company_id = _company_id) THEN
      PERFORM public._notify(_company_id, v_target, NULL, 'manager_message'::public.notification_event,
                             v_title, v_body, _priority::public.notification_priority, v_meta);
      v_sent := v_sent + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  -- Encaminhamento a alguém fora do programa: registo para a gestão acompanhar.
  IF v_forward IS NOT NULL THEN
    FOR v_mgr IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.company_id = _company_id AND ur.role IN ('manager', 'owner')
    LOOP
      INSERT INTO public.notifications
        (company_id, user_id, event, title, body, priority, metadata,
         state, state_changed_at, state_changed_by, forwarded_to, read_at)
      VALUES
        (_company_id, v_mgr, 'manager_message', v_title, v_body, _priority::public.notification_priority,
         v_meta || jsonb_build_object('forward_copy', true),
         'encaminhada', now(), v_uid, v_forward, CASE WHEN v_mgr = v_uid THEN now() END);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('enviadas', v_sent, 'ignoradas', v_skipped, 'encaminhada_para', v_forward);
END
$f$;
REVOKE ALL ON FUNCTION public.manager_send_notification(uuid, uuid[], text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_send_notification(uuid, uuid[], text, text, text, text) TO authenticated;

COMMIT;

SELECT jsonb_build_object(
  'funcao_criada', to_regprocedure('public.manager_send_notification(uuid,uuid[],text,text,text,text)') IS NOT NULL
)::text AS resultado;
