-- =====================================================================
-- OmniBiz · 15/11/2026 — SUP-2026-000294: o GESTOR marca a falta quando
-- souber (ex.: a funcionária avisou que está doente), sem esperar.
-- Desfazer: falta_gestor_20261115_desfazer.sql
--
-- Antes: task_mark_absent só aceitava 1h depois do início (na Bélgica, por o
-- horário da tarefa estar guardado como hora de parede, eram na prática 2h)
-- e, numa tarefa sem hora, só no dia seguinte.
-- Agora: tira-se SÓ essa espera. Ficam iguais as outras regras:
--   • só gestor (já era assim nesta função);
--   • só tarefa pendente ou autorizada, com responsável e com data;
--   • com ponto aberto continua bloqueado;
--   • auditoria e notificações como antes.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE d text; n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public._omnibiz_fn_backup WHERE tag = 'falta_gestor_20261115') THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'task_mark_absent' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'PARAR: esperava exatamente uma função task_mark_absent. Nada foi alterado.';
  END IF;
  d := pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname = 'task_mark_absent' AND pronamespace = 'public'::regnamespace));
  IF position('Apenas gestor pode marcar falta' IN d) = 0 THEN
    RAISE EXCEPTION 'PARAR: a função já não exige gestor; não mexo na espera. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(d,
    'IF v_task\.scheduled_for IS NOT NULL THEN\s*IF now\(\) < v_task\.scheduled_for \+ interval ''1 hour'' THEN\s*RAISE EXCEPTION ''A tarefa ainda nao atingiu o horario permitido para marcacao de falta'';\s*END IF;\s*ELSIF CURRENT_DATE <= v_occurrence_date THEN\s*RAISE EXCEPTION ''Tarefa sem horario so pode virar falta no dia seguinte'';\s*END IF;', 'g');
  IF n <> 1 THEN
    RAISE EXCEPTION 'PARAR: o bloco da espera não está como esperado (%). Nada foi alterado.', n;
  END IF;
END
$guard$;

INSERT INTO public._omnibiz_fn_backup (tag, fn, def, def_md5)
SELECT 'falta_gestor_20261115', p.oid::regprocedure::text, pg_get_functiondef(p.oid), md5(pg_get_functiondef(p.oid))
FROM pg_proc p WHERE p.proname = 'task_mark_absent' AND p.pronamespace = 'public'::regnamespace;

DO $p$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname = 'task_mark_absent' AND pronamespace = 'public'::regnamespace));
  n := regexp_replace(d,
    'IF v_task\.scheduled_for IS NOT NULL THEN\s*IF now\(\) < v_task\.scheduled_for \+ interval ''1 hour'' THEN\s*RAISE EXCEPTION ''A tarefa ainda nao atingiu o horario permitido para marcacao de falta'';\s*END IF;\s*ELSIF CURRENT_DATE <= v_occurrence_date THEN\s*RAISE EXCEPTION ''Tarefa sem horario so pode virar falta no dia seguinte'';\s*END IF;',
    '-- SUP-2026-000294 (15/11/2026): o gestor marca a falta quando souber; sem espera.
  NULL;');
  IF n = d OR position('SUP-2026-000294' IN n) = 0 THEN
    RAISE EXCEPTION 'PARAR: a troca falhou. Nada foi alterado.';
  END IF;
  EXECUTE n;
END
$p$;

COMMIT;

SELECT jsonb_build_object(
  'espera_removida', position('ainda nao atingiu o horario permitido' IN pg_get_functiondef(
      (SELECT oid FROM pg_proc WHERE proname = 'task_mark_absent' AND pronamespace = 'public'::regnamespace))) = 0,
  'continua_so_gestor', position('Apenas gestor pode marcar falta' IN pg_get_functiondef(
      (SELECT oid FROM pg_proc WHERE proname = 'task_mark_absent' AND pronamespace = 'public'::regnamespace))) > 0,
  'copia_guardada', (SELECT count(*) FROM public._omnibiz_fn_backup WHERE tag = 'falta_gestor_20261115')
)::text AS resultado;
