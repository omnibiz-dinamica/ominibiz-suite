-- OmniBiz · DESFAZER equipas_aplicar.sql (12/11/2026): o Setor volta ao texto antigo.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public._omnibiz_revert_20261112_setor') IS NULL THEN
    RAISE EXCEPTION 'PARAR: não encontrei a cópia (o aplicar não correu?). Nada foi alterado.';
  END IF;
END
$guard$;
UPDATE public.profiles p SET sector = b.sector_antes
FROM public._omnibiz_revert_20261112_setor b
WHERE p.id = b.id AND p.sector IS NOT DISTINCT FROM b.sector_depois;
DROP TABLE public._omnibiz_revert_20261112_setor;
COMMIT;
SELECT 'desfeito' AS resultado;
