import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { readProfileLanguage, resolveLoginLanguage, saveProfileLanguage } from "@/lib/language-profile";
import { Languages } from "lucide-react";
import { LANGUAGES, readSavedLanguage, setAppLanguage, useT, type AppLanguage } from "@/i18n";

/** Restores the saved language after hydration (server always renders Portuguese). */
export function LanguageRestorer() {
  useEffect(() => {
    const saved = readSavedLanguage();
    if (saved !== "pt-BR") setAppLanguage(saved);
  }, []);
  return null;
}

/** 22/11/2026: ao entrar, aplica o idioma guardado no perfil da pessoa. */
export function LanguageProfileSync() {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void readProfileLanguage(userId).then((profileLang) => {
      if (cancelled) return;
      const { apply, save } = resolveLoginLanguage(profileLang, readSavedLanguage());
      if (apply) setAppLanguage(apply);
      if (save) void saveProfileLanguage(save);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return null;
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, lang } = useT();
  const { user } = useAuth();
  return (
    <label className={`inline-flex items-center gap-1 text-sm text-muted-foreground ${className ?? ""}`}>
      <Languages className="h-4 w-4" aria-hidden />
      <span className="sr-only">{t("Idioma")}</span>
      <select
        value={lang}
        onChange={(e) => {
          const next = e.target.value as AppLanguage;
          setAppLanguage(next);
          // 22/11/2026: guarda também no perfil (vale em todos os aparelhos).
          if (user?.id) void saveProfileLanguage(next);
        }}
        className="h-8 rounded-md border border-border bg-background px-1.5 text-sm text-foreground"
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value} lang={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
