import { useEffect } from "react";
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

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, lang } = useT();
  return (
    <label className={`inline-flex items-center gap-1 text-sm text-muted-foreground ${className ?? ""}`}>
      <Languages className="h-4 w-4" aria-hidden />
      <span className="sr-only">{t("Idioma")}</span>
      <select
        value={lang}
        onChange={(e) => setAppLanguage(e.target.value as AppLanguage)}
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
