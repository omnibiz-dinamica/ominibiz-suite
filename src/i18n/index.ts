import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { enCommon, enDashboard, enLanding, enLogin, enNavigation, enTasks } from "./locales/en";

export type AppLanguage = "pt-BR" | "en";
export const DEFAULT_LANGUAGE: AppLanguage = "pt-BR";
export const LANGUAGE_STORAGE_KEY = "omnibiz:language";

/**
 * pt-BR is the source language: keys are the Portuguese text itself, so the
 * pt-BR dictionary is the identity of every key (identical to today's text).
 */
const identity = (dict: Record<string, string>) =>
  Object.fromEntries(Object.keys(dict).map((k) => [k, k]));

export const enModules = { navigation: enNavigation, login: enLogin, dashboard: enDashboard, common: enCommon, landing: enLanding, tasks: enTasks };
export const ptModules = Object.fromEntries(
  Object.entries(enModules).map(([m, d]) => [m, identity(d)]),
) as Record<keyof typeof enModules, Record<string, string>>;

const merge = (mods: Record<string, Record<string, string>>) => Object.assign({}, ...Object.values(mods));

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      "pt-BR": { translation: merge(ptModules) },
      en: { translation: merge(enModules) },
    },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export function readSavedLanguage(): AppLanguage {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setAppLanguage(lang: AppLanguage) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
  void i18n.changeLanguage(lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

/** t("texto em português") — returns the text in the active language, falling back to Portuguese. */
export function useT() {
  const { t, i18n: inst } = useTranslation();
  return { t: (key: string, opts?: Record<string, unknown>) => t(key, { defaultValue: key, ...opts }) as string, lang: inst.language as AppLanguage };
}

export default i18n;
