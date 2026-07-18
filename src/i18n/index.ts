/**
 * i18n scaffolding (react-i18next). English is the only shipped locale; the
 * setup + a language switcher exist so more locales can be added incrementally.
 * A representative set of strings is migrated to `t()`; the rest follow the
 * same pattern over time (docs/decisions.md).
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";

export const SUPPORTED_LOCALES = [{ code: "en", label: "English" }] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]["code"];

const stored = typeof localStorage !== "undefined" ? localStorage.getItem("ui.locale") : null;

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: stored ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Persist + apply a locale change (English only for now). */
export function setLocale(code: LocaleCode): void {
  void i18n.changeLanguage(code);
  if (typeof localStorage !== "undefined") localStorage.setItem("ui.locale", code);
}

export default i18n;
