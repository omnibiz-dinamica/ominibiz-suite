-- OmniBiz · DESFAZER idioma_perfil_20261122_aplicar.sql
-- Remove a função e a coluna (perde-se o idioma guardado; cada aparelho
-- volta a usar só a escolha local, como antes).
BEGIN;
DROP FUNCTION IF EXISTS public.set_my_language(text);
ALTER TABLE public.profiles DROP COLUMN IF EXISTS preferred_language;
COMMIT;
SELECT jsonb_build_object(
  'coluna_removida', NOT EXISTS (SELECT 1 FROM information_schema.columns
                                 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferred_language')
)::text AS resultado;
