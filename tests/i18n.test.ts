import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES, matchLocale } from "@/lib/i18n/config";
import { messages, translator, type MessageKey } from "@/lib/i18n/messages";
import { formatDuration, timeAgo } from "@/lib/format";

test("Accept-Language negotiation honours q-values and region tags", () => {
  assert.equal(matchLocale("es-MX,es;q=0.9,en;q=0.8"), "es");
  assert.equal(matchLocale("fr-FR,pt-BR;q=0.8,en;q=0.5"), "pt");
  assert.equal(matchLocale("en;q=0.2,es;q=0.9"), "es");
  assert.equal(matchLocale("de,fr"), "en");
  assert.equal(matchLocale(null), "en");
  assert.equal(matchLocale("es;q=0"), "en");
});

test("every locale defines the same placeholders as English", () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of LOCALES) {
    for (const key of Object.keys(messages.en) as MessageKey[]) {
      const text = messages[locale][key];
      assert.ok(text && text.trim().length > 0, `${locale}:${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(messages.en[key]), `${locale}:${key} placeholders`);
    }
  }
});

test("translator interpolates every occurrence of a placeholder", () => {
  const t = translator("es");
  assert.equal(t("clip.followed", { name: "Westcol" }), "Ahora sigues a Westcol");
  assert.equal(translator("en")("feed.emptyScoped", { label: "@xqc" }), "No clips for @xqc yet.");
});

test("durations and relative times", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(61.4), "1:01");
  assert.equal(formatDuration(-5), "0:00");
  const now = Date.UTC(2026, 9, 15, 12);
  assert.equal(timeAgo(new Date(now - 30_000).toISOString(), "en", "just now", now), "just now");
  assert.match(timeAgo(new Date(now - 5 * 60_000).toISOString(), "en", "just now", now), /5/);
  assert.match(timeAgo(new Date(now - 3 * 86_400_000).toISOString(), "es", "ahora", now), /3/);
  assert.equal(timeAgo("not a date", "en", "just now", now), "just now");
});
