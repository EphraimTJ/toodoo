import { useTranslation } from "react-i18next";
import { setLocale, SUPPORTED_LOCALES, type LocaleCode } from "../../../i18n";

/** Language selector. English is the only shipped locale; the switcher exists so
 *  future locales drop in without more wiring. */
export function LanguageSettings() {
  const { i18n } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-sm" data-testid="language-settings">
      <span className="text-xs font-medium text-text-muted">Language</span>
      <select
        aria-label="Language"
        value={i18n.language}
        onChange={(e) => setLocale(e.target.value as LocaleCode)}
        className="rounded border border-border bg-bg px-2 py-1 text-sm"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
