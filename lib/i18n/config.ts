// Kick's biggest audiences outside the US are Spanish- and Portuguese-
// speaking, so those ship alongside English.
export const LOCALES = ["en", "es", "pt"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "highkick-locale";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

// English unless the visitor picked a language in Settings: the browser's
// Accept-Language is deliberately ignored so every first visit is in English.
export function resolveLocale(chosen: unknown): Locale {
  return isLocale(chosen) ? chosen : DEFAULT_LOCALE;
}
