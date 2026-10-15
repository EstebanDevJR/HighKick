import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "@/lib/i18n/config";
import { translator } from "@/lib/i18n/messages";

// An explicit choice (cookie) wins over the browser's Accept-Language.
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const chosen = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  const headerStore = await headers();
  return matchLocale(headerStore.get("accept-language"));
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
