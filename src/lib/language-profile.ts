/**
 * 22/11/2026 — idioma guardado no perfil (vale em todos os aparelhos).
 * Tolerante: sem a coluna/RPC (SQL ainda não aplicado) fica como antes,
 * só com a escolha guardada no aparelho.
 */
import { supabase } from "@/integrations/supabase/client";
import { isAppLanguage, type AppLanguage } from "@/i18n";

export async function readProfileLanguage(userId: string): Promise<AppLanguage | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("profiles" as never) as any)
      .select("preferred_language")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null;
    const v = (data as { preferred_language?: string | null } | null)?.preferred_language;
    return isAppLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

export async function saveProfileLanguage(lang: AppLanguage): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)("set_my_language", { _lang: lang });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Ao entrar: o idioma do perfil manda. Se o perfil ainda não tem idioma mas
 * este aparelho tem uma escolha (diferente do português), guarda-a no perfil.
 */
export function resolveLoginLanguage(
  profileLang: AppLanguage | null,
  deviceLang: AppLanguage,
): { apply: AppLanguage | null; save: AppLanguage | null } {
  if (profileLang) return { apply: profileLang === deviceLang ? null : profileLang, save: null };
  return { apply: null, save: deviceLang !== "pt-BR" ? deviceLang : null };
}
