-- =====================================================================
-- OmniBiz · 22/11/2026 — Idioma guardado no perfil (vale em todos os
-- aparelhos). Desfazer: idioma_perfil_20261122_desfazer.sql
--   • profiles.preferred_language (pt-BR, en, nl-BE, fr-BE; vazio = como hoje)
--   • set_my_language(_lang): cada pessoa só muda o SEU idioma.
-- Não altera dados existentes.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferred_language')
     OR to_regprocedure('public.set_my_language(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PARAR: este script já foi aplicado. Nada foi alterado.';
  END IF;
END
$guard$;

ALTER TABLE public.profiles
  ADD COLUMN preferred_language text
  CONSTRAINT profiles_preferred_language_chk
  CHECK (preferred_language IS NULL OR preferred_language IN ('pt-BR', 'en', 'nl-BE', 'fr-BE'));

CREATE FUNCTION public.set_my_language(_lang text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _lang NOT IN ('pt-BR', 'en', 'nl-BE', 'fr-BE') THEN RAISE EXCEPTION 'Idioma inválido'; END IF;
  UPDATE public.profiles SET preferred_language = _lang WHERE id = v_uid;
  RETURN _lang;
END
$f$;
REVOKE ALL ON FUNCTION public.set_my_language(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_language(text) TO authenticated;

COMMIT;

SELECT jsonb_build_object(
  'coluna_criada', EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferred_language'),
  'funcao_criada', to_regprocedure('public.set_my_language(text)') IS NOT NULL
)::text AS resultado;
