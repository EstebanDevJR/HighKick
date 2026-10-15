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

// Picks the best supported locale from an Accept-Language header, honouring
// q-values ("es-MX,es;q=0.9,en;q=0.8" → "es").
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return { lang: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((x) => x.lang && x.quality > 0)
    .sort((a, b) => b.quality - a.quality);
  for (const { lang } of ranked) {
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}
