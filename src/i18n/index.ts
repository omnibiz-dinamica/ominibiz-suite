import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import {
  enCommon,
  enDashboard,
  enLanding,
  enLogin,
  enNavigation,
  enNotifications,
  enTasks,
  enTimesheetPdf,
} from "./locales/en";
import {
  nlCommon,
  nlDashboard,
  nlLanding,
  nlLogin,
  nlNavigation,
  nlNotifications,
  nlTasks,
  nlTimesheetPdf,
} from "./locales/nl";
import {
  frCommon,
  frDashboard,
  frLanding,
  frLogin,
  frNavigation,
  frNotifications,
  frTasks,
  frTimesheetPdf,
} from "./locales/fr";

export type AppLanguage = "pt-BR" | "en" | "nl-BE" | "fr-BE";
export const DEFAULT_LANGUAGE: AppLanguage = "pt-BR";
export const LANGUAGE_STORAGE_KEY = "omnibiz:language";

/** Línguas do seletor (nome na própria língua). */
export const LANGUAGES: { value: AppLanguage; label: string }[] = [
  { value: "pt-BR", label: "Português" },
  { value: "en", label: "English" },
  { value: "nl-BE", label: "Nederlands" },
  { value: "fr-BE", label: "Français" },
];

export function isAppLanguage(v: unknown): v is AppLanguage {
  return LANGUAGES.some((l) => l.value === v);
}

/** Locale para datas/números (Intl) de cada língua. */
export function dateLocale(lang: string | null | undefined): string {
  if (lang === "en") return "en-GB";
  if (lang === "nl-BE" || lang === "fr-BE") return lang;
  return "pt-PT";
}

/**
 * pt-BR is the source language: keys are the Portuguese text itself, so the
 * pt-BR dictionary is the identity of every key (identical to today's text).
 */
const identity = (dict: Record<string, string>) =>
  Object.fromEntries(Object.keys(dict).map((k) => [k, k]));

export const enModules = {
  navigation: enNavigation,
  login: enLogin,
  dashboard: enDashboard,
  common: enCommon,
  landing: enLanding,
  tasks: enTasks,
  timesheetPdf: enTimesheetPdf,
  notifications: enNotifications,
};
export const nlModules: Record<keyof typeof enModules, Record<string, string>> = {
  navigation: nlNavigation,
  login: nlLogin,
  dashboard: nlDashboard,
  common: nlCommon,
  landing: nlLanding,
  tasks: nlTasks,
  timesheetPdf: nlTimesheetPdf,
  notifications: nlNotifications,
};
export const frModules: Record<keyof typeof enModules, Record<string, string>> = {
  navigation: frNavigation,
  login: frLogin,
  dashboard: frDashboard,
  common: frCommon,
  landing: frLanding,
  tasks: frTasks,
  timesheetPdf: frTimesheetPdf,
  notifications: frNotifications,
};
export const ptModules = Object.fromEntries(
  Object.entries(enModules).map(([m, d]) => [m, identity(d)]),
) as Record<keyof typeof enModules, Record<string, string>>;

const merge = (mods: Record<string, Record<string, string>>) =>
  Object.assign({}, ...Object.values(mods));

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      "pt-BR": { translation: merge(ptModules) },
      en: { translation: merge(enModules) },
      "nl-BE": { translation: merge(nlModules) },
      "fr-BE": { translation: merge(frModules) },
    },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES.map((l) => l.value),
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export function readSavedLanguage(): AppLanguage {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(saved) ? saved : DEFAULT_LANGUAGE;
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

/** Língua ativa agora (fora de componentes React, ex.: PDF). */
export function currentLanguage(): AppLanguage {
  return isAppLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

/** Tradutor fixo numa língua (fora de React). Sem tradução, devolve o português. */
export function translator(lang: AppLanguage = currentLanguage()) {
  return (key: string, opts?: Record<string, unknown>) =>
    i18n.t(key, { lng: lang, defaultValue: key, ...opts }) as string;
}

/** t("texto em português") — returns the text in the active language, falling back to Portuguese. */
export function useT() {
  const { t, i18n: inst } = useTranslation();
  return {
    t: (key: string, opts?: Record<string, unknown>) =>
      t(key, { defaultValue: key, ...opts }) as string,
    lang: (isAppLanguage(inst.language) ? inst.language : DEFAULT_LANGUAGE) as AppLanguage,
  };
}

export default i18n;
