import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/lib/i18n/config";
import { translator } from "@/lib/i18n/messages";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
