"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { KickBoltIcon, SearchIcon, VerifiedIcon } from "@/components/icons";
import { formatCount } from "@/lib/format";
import { clipPath, SLUG_RE, type SearchResults } from "@/lib/kick/types";
import { createStore } from "@/lib/store";

const recentStore = createStore<string[]>({
  key: "recent-searches",
  fallback: [],
  parse: (raw) =>
    Array.isArray(raw) ? raw.filter((q): q is string => typeof q === "string").slice(0, 8) : [],
});

function rememberQuery(q: string) {
  const query = q.trim();
  if (query.length < 2) return;
  recentStore.set((prev) => [query, ...prev.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 8));
}

interface Item {
  key: string;
  href: string;
}

const EMPTY: SearchResults = { query: "", channels: [], categories: [], clips: [] };

export default function SearchPanel({
  initialQuery = "",
  initialResults = null,
  autoFocus = false,
  onNavigate,
}: {
  initialQuery?: string;
  initialResults?: SearchResults | null;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResults>(initialResults ?? EMPTY);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const recent = useSyncExternalStore(recentStore.subscribe, recentStore.get, recentStore.serverSnapshot);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2 || trimmed === initialResults?.query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setResults(await res.json());
          setHighlight(-1);
        }
      } catch {
        // aborted or offline — keep the previous results on screen
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, initialResults?.query]);

  const shown = trimmed.length >= 2 && results.query === trimmed ? results : EMPTY;
  const handle = trimmed.replace(/^@/, "").replace(/\s+/g, "").toLowerCase();
  const handleIsSlug = SLUG_RE.test(handle);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    shown.channels.forEach((c) => list.push({ key: `ch:${c.slug}`, href: `/c/${c.slug}` }));
    shown.categories.forEach((c) => list.push({ key: `cat:${c.slug}`, href: `/g/${c.slug}` }));
    shown.clips.forEach((c) => list.push({ key: `clip:${c.id}`, href: clipPath(c) }));
    return list;
  }, [shown]);

  function go(href: string) {
    rememberQuery(trimmed);
    onNavigate?.();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(-1, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[highlight] ?? items[0];
      if (item) go(item.href);
      else if (handleIsSlug) go(`/c/${handle}`);
    }
  }

  const activeKey = items[highlight]?.key;
  const itemClass = (key: string) =>
    `flex items-center gap-3 rounded-xl px-2 py-2 transition-colors ${
      activeKey === key ? "bg-kick/15" : "hover:bg-white/5"
    }`;
  const nothing =
    trimmed.length >= 2 && !loading && results.query === trimmed && items.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink px-3 py-2.5 focus-within:border-kick/60">
        <SearchIcon width={18} height={18} className="shrink-0 text-fog/50" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("search.placeholder")}
          aria-label={t("nav.search")}
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-base text-fog outline-none placeholder:text-fog/35 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {loading && (
          <span
            aria-label={t("search.searching")}
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-kick/25 border-t-kick"
          />
        )}
      </label>

      {trimmed.length < 2 && (
        <div className="flex flex-col gap-3">
          {recent.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog/40">
                  {t("search.recent")}
                </h3>
                <button
                  onClick={() => recentStore.set([])}
                  className="font-mono text-[11px] uppercase tracking-wider text-fog/40 hover:text-kick"
                >
                  {t("search.clearRecent")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuery(q)}
                    className="rounded-full border border-white/10 px-3 py-1 text-sm text-fog/80 hover:border-kick/50 hover:text-kick"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-sm text-fog/45">{t("search.hint")}</p>
        </div>
      )}

      {handleIsSlug && trimmed.length >= 2 && !shown.channels.some((c) => c.slug === handle) && (
        <button
          onClick={() => go(`/c/${handle}`)}
          className="flex items-center gap-2 self-start rounded-full border border-kick/40 bg-kick/10 px-3 py-1 font-mono text-xs font-semibold text-kick hover:bg-kick hover:text-ink"
        >
          <KickBoltIcon width={12} height={12} />@{handle}
        </button>
      )}

      {shown.channels.length > 0 && (
        <section>
          <h3 className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-fog/40">
            {t("search.channels")}
          </h3>
          <ul className="flex flex-col">
            {shown.channels.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/c/${c.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(`/c/${c.slug}`);
                  }}
                  className={itemClass(`ch:${c.slug}`)}
                >
                  <span
                    className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ${
                      c.isLive ? "ring-red-500" : "ring-white/10"
                    }`}
                  >
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-ink font-display font-extrabold text-kick">
                        {c.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate font-semibold text-fog">
                      {c.username}
                      {c.verified && <VerifiedIcon width={14} height={14} className="shrink-0 text-kick" />}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-fog/45">
                      @{c.slug}
                      {c.followers !== null && ` · ${t("search.followers", { n: formatCount(c.followers, locale) })}`}
                    </span>
                  </span>
                  {c.isLive && (
                    <span className="rounded-sm bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-white">
                      {t("search.live")}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.categories.length > 0 && (
        <section>
          <h3 className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-fog/40">
            {t("search.categories")}
          </h3>
          <ul className="flex flex-col">
            {shown.categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/g/${c.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(`/g/${c.slug}`);
                  }}
                  className={itemClass(`cat:${c.slug}`)}
                >
                  <span className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink ring-1 ring-white/10">
                    {c.banner && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.banner} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fog">{c.name}</span>
                    {c.viewers !== null && (
                      <span className="block font-mono text-[11px] text-fog/45">
                        {t("explore.viewers", { n: formatCount(c.viewers, locale) })}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.clips.length > 0 && (
        <section>
          <h3 className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-fog/40">
            {t("search.clips")}
          </h3>
          <ul className="flex flex-col">
            {shown.clips.map((c) => (
              <li key={c.id}>
                <Link
                  href={clipPath(c)}
                  onClick={(e) => {
                    e.preventDefault();
                    go(clipPath(c));
                  }}
                  className={itemClass(`clip:${c.id}`)}
                >
                  <span className="h-10 w-16 shrink-0 overflow-hidden rounded bg-ink ring-1 ring-white/10">
                    {c.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fog">{c.title || c.channel.username}</span>
                    <span className="block truncate font-mono text-[11px] text-fog/45">
                      @{c.channel.username} · {t("explore.views", { n: formatCount(c.views, locale) })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nothing && !handleIsSlug && (
        <p className="py-6 text-center text-sm text-fog/50">{t("search.empty", { q: trimmed })}</p>
      )}
    </div>
  );
}
