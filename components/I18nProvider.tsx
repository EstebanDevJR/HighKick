"use client";

import { createContext, useContext, useMemo } from "react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { translator, type TFunction } from "@/lib/i18n/messages";

interface I18nValue {
  locale: Locale;
  t: TFunction;
}

const I18nContext = createContext<I18nValue>({
  locale: "en",
  t: translator("en"),
});

// The locale is resolved on the server (the Settings cookie, else English) and
// handed down here, so server and client render the same strings.
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, t: translator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export function persistLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
