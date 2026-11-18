-- =====================================================================
-- OmniBiz · 18/11/2026 — Documento LIDO pelo funcionário avisa os gestores.
-- Desfazer: documento_lido_20261118_desfazer.sql
--
-- Antes: employee_attachment_mark_viewed só escrevia no histórico; só a
-- assinatura (employee_attachment_sign) notificava gestores/owners.
-- Agora: ao ler, gestores e owners da empresa recebem "Documento lido"
-- (mesmo formato e link da notificação de assinatura).
-- Iguais: quem pode ler (dono do anexo, visível, ação "visualizar"),
-- estado viewed/viewed_at, histórico. Nada de dados existentes muda.
-- O valor novo do enum (employee_document_viewed) fica mesmo se desfizer
-- (o Postgres não remove valores de enum; não afeta nada).
--
-- CORRER EM 2 PASSOS (o Postgres não usa um valor novo de enum na mesma
-- transação em que foi criado):
--   Passo 1: documento_lido_20261118_passo1_enum.sql
--   Passo 2: este arquivo.
-- =====================================================================

BEGIN;

DO $guard$
DECLARE d text;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'documento_lido_20261118') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'notification_event' AND e.enumlabel = 'employee_document_viewed') THEN
    RAISE EXCEPTION 'PARAR: corra primeiro o passo 1 (documento_lido_20261118_passo1_enum.sql). Nada foi alterado.';
  END IF;
  d := pg_get_functiondef('public.employee_attachment_mark_viewed(uuid)'::regprocedure);
  IF position(E'  v_name text;\n' IN d) = 0
     OR position('  RETURN jsonb_build_object(''status'', ''viewed'', ''viewed_at'', now());' IN d) = 0
     OR position('employee_document_viewed' IN d) > 0 THEN
    RAISE EXCEPTION 'PARAR: employee_attachment_mark_viewed não está como esperado. Nada foi alterado.';
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'documento_lido_20261118', p::text, pg_get_functiondef(p), md5(pg_get_functiondef(p))
FROM unnest(ARRAY['public.employee_attachment_mark_viewed(uuid)'::regprocedure]) p;

DO $apply$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.employee_attachment_mark_viewed(uuid)'::regprocedure);
  d := replace(d, E'  v_name text;\n', E'  v_name text;\n  v_target uuid;\n');
  d := replace(d, '  RETURN jsonb_build_object(''status'', ''viewed'', ''viewed_at'', now());',
$new$  -- 18/11/2026: gestores e owners são avisados de que o documento foi lido.
  BEGIN
    FOR v_target IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.company_id = a.company_id AND ur.role IN ('manager','owner')
        AND ur.user_id <> a.profile_id
    LOOP
      PERFORM public._notify(
        a.company_id, v_target, NULL,
        'employee_document_viewed'::public.notification_event,
        'Documento lido',
        coalesce(v_name, 'Funcionário') || ' leu "' || a.file_name || '".',
        'baixa'::public.notification_priority,
        jsonb_build_object(
          'attachment_id', a.id,
          'user_id', a.profile_id,
          'link', '/app/equipe?employee=' || a.profile_id::text));
    END LOOP;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'employee_attachment_mark_viewed: notificação falhou: %', SQLERRM;
  END;
  RETURN jsonb_build_object('status', 'viewed', 'viewed_at', now());$new$);
  EXECUTE d;
END
$apply$;

COMMIT;

SELECT jsonb_build_object(
  'enum_novo', EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                       WHERE t.typname = 'notification_event' AND e.enumlabel = 'employee_document_viewed'),
  'ler_avisa_gestores', position('employee_document_viewed' IN pg_get_functiondef('public.employee_attachment_mark_viewed(uuid)'::regprocedure)) > 0
)::text AS resultado;
