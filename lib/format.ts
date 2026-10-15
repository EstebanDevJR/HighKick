import type { Locale } from "@/lib/i18n/config";

const compactCache = new Map<string, Intl.NumberFormat>();
const relativeCache = new Map<string, Intl.RelativeTimeFormat>();

export function formatCount(n: number, locale: Locale = "en"): string {
  let fmt = compactCache.get(locale);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
    compactCache.set(locale, fmt);
  }
  return fmt.format(n);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60],
  ["month", 30 * 24 * 60],
  ["day", 24 * 60],
  ["hour", 60],
  ["minute", 1],
];

export function timeAgo(
  iso: string,
  locale: Locale = "en",
  justNow = "just now",
  now = Date.now(),
): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return justNow;
  let fmt = relativeCache.get(locale);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "narrow" });
    relativeCache.set(locale, fmt);
  }
  for (const [unit, size] of UNITS) {
    if (mins >= size) return fmt.format(-Math.floor(mins / size), unit);
  }
  return justNow;
}
