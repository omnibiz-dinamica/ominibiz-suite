-- =====================================================================
-- OmniBiz · 12/11/2026 — Ticket 172: nomes das equipas (campo Setor)
-- Desfazer: equipas_desfazer.sql
--
-- Uniformiza o Setor dos funcionários do Grupo V-clean para os nomes que o
-- dono escolheu: coifa → COIFAS, Happykot → HAPPYKOTS, Tobaco → TOBACCO,
-- RK Ariane → RK (sem diferenciar maiúsculas/espaços). Não mexe em mais nada.
-- DELIVA e VÁRIOS escolhem-se depois no cadastro de cada pessoa.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public._omnibiz_revert_20261112_setor') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
END
$guard$;

CREATE TABLE public._omnibiz_revert_20261112_setor AS
SELECT p.id, p.sector AS sector_antes,
       CASE upper(regexp_replace(btrim(p.sector), '\s+', ' ', 'g'))
         WHEN 'COIFA' THEN 'COIFAS' WHEN 'COIFAS' THEN 'COIFAS'
         WHEN 'HAPPYKOT' THEN 'HAPPYKOTS' WHEN 'HAPPYKOTS' THEN 'HAPPYKOTS'
         WHEN 'TOBACO' THEN 'TOBACCO' WHEN 'TOBACCO' THEN 'TOBACCO'
         WHEN 'RK ARIANE' THEN 'RK' WHEN 'RK' THEN 'RK'
       END AS sector_depois
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c')
  AND upper(regexp_replace(btrim(p.sector), '\s+', ' ', 'g')) IN
      ('COIFA','COIFAS','HAPPYKOT','HAPPYKOTS','TOBACO','TOBACCO','RK ARIANE','RK');
DELETE FROM public._omnibiz_revert_20261112_setor WHERE sector_antes = sector_depois;
ALTER TABLE public._omnibiz_revert_20261112_setor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._omnibiz_revert_20261112_setor FROM PUBLIC, anon, authenticated;

UPDATE public.profiles p SET sector = b.sector_depois
FROM public._omnibiz_revert_20261112_setor b
WHERE p.id = b.id AND p.sector IS NOT DISTINCT FROM b.sector_antes;

COMMIT;

SELECT jsonb_build_object(
  'alterados', (SELECT count(*) FROM public._omnibiz_revert_20261112_setor),
  'equipas_vclean', (SELECT jsonb_object_agg(COALESCE(sector, '(sem equipa)'), n) FROM (
     SELECT p.sector, count(*) n FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c')
     GROUP BY 1) x)
)::text AS resultado;
