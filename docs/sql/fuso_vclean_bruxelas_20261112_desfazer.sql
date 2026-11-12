-- OmniBiz · DESFAZER fuso_aplicar.sql (12/11/2026): V-clean volta a Europe/Lisbon.
BEGIN;
DO $guard$
BEGIN
  IF (SELECT timezone FROM public.companies WHERE id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c') IS DISTINCT FROM 'Europe/Brussels' THEN
    RAISE EXCEPTION 'PARAR: o V-clean não está em Europe/Brussels. Nada foi alterado.';
  END IF;
END
$guard$;
UPDATE public.companies SET timezone = 'Europe/Lisbon', updated_at = now()
WHERE id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c';
COMMIT;
SELECT name, timezone FROM public.companies WHERE id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c';
