-- =====================================================================
-- OmniBiz · 12/11/2026 — SUP-2026-000323: fuso do Grupo V-clean = Bélgica
-- Desfazer: fuso_desfazer.sql
--
-- O dono confirmou que os funcionários do V-clean trabalham na Bélgica.
-- Muda só companies.timezone do V-clean: Europe/Lisbon → Europe/Brussels.
-- Nenhum ponto, tarefa ou folha assinada é alterado (as versões assinadas
-- guardam o seu próprio conteúdo). Pontos sem fuso do telemóvel passam a
-- ser mostrados na hora da Bélgica (+1h face a Lisboa).
-- =====================================================================
BEGIN;

DO $guard$
DECLARE v text;
BEGIN
  SELECT timezone INTO v FROM public.companies WHERE id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c';
  IF NOT FOUND THEN RAISE EXCEPTION 'PARAR: empresa não encontrada. Nada foi alterado.'; END IF;
  IF v = 'Europe/Brussels' THEN RAISE EXCEPTION 'PARAR: o V-clean já está em Europe/Brussels. Nada foi alterado.'; END IF;
  IF v IS DISTINCT FROM 'Europe/Lisbon' THEN
    RAISE EXCEPTION 'PARAR: fuso atual inesperado (%). Nada foi alterado.', v;
  END IF;
END
$guard$;

UPDATE public.companies SET timezone = 'Europe/Brussels', updated_at = now()
WHERE id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c' AND timezone = 'Europe/Lisbon';

COMMIT;

SELECT name, timezone FROM public.companies WHERE id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c';
