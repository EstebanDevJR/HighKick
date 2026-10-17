# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
# HighKick — Agent Guide

HighKick is an open-source, short-video-style vertical clip feed for [Kick.com](https://kick.com).
Stack: **Next.js 16 App Router · React 19 · Tailwind CSS v4 · hls.js · impit · TypeScript**. Node.js 22.12+.

## Commands

```bash
npm run dev        # dev server at http://localhost:3000
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (strict)
npm test           # unit tests in tests/ (Node's built-in runner, no framework)
npm run check      # lint + typecheck + test + build — what CI runs
```

## Definition of done

A change is not finished until `npm run check` passes and the change has been looked at in a browser.

- Tests live in `tests/*.test.ts` and run on `node --test` with type stripping; `scripts/test-resolve.mjs` maps the `@/` alias. Test pure logic (normalizers, ranking, rate limiting, i18n) and the HTTP layer via the scripted impit fake in `tests/http.test.ts`. There are no component tests — verify UI manually.
- There are **no required environment variables or secrets**. Don't introduce any without asking first. (`HTTPS_PROXY` is honoured by impit as a standard variable; HighKick doesn't read it itself.)

## Key architecture decisions

- **No official Kick clips API.** Kick's undocumented `/api/v2/*` sits behind Cloudflare TLS fingerprinting. All Kick requests go through `lib/kick/` on the server using `impit` (successor to the EOL `got-scraping`). IMPORTANT: never call Kick's API from the browser or with plain `fetch`/`axios` — it will get a Cloudflare 403.
- **One door to Kick.** `lib/kick/http.ts` (`kickGet`) is the only code that performs Kick requests. It owns the 60 s cache, stale-if-error, in-flight dedupe, concurrency cap, retries (never on 403) and per-endpoint-family circuit breakers. Every call passes an `EndpointGroup`; best-effort endpoints must not share a group with the clip listings. Don't bypass it.
- **Shared state lives on `globalThis`.** Next.js instantiates server modules separately for pages and route handlers. The Kick cache/stats and the rate limiter are stored under `Symbol.for(...)` keys so both layers share them. Anything else that must be process-wide needs the same treatment.
- **Normalize at the boundary.** Raw Kick JSON never leaves `lib/kick/`. `normalize.ts` turns it into the types in `lib/kick/types.ts` (`Clip`, `Channel`, `Category`…), tolerating renamed/missing fields and dropping records that can't render. Only `https` URLs and well-formed slugs/ids get through.
- **Client-only persistence.** Likes, history, follows, hidden channels/categories, preferences and the taste profile are localStorage-only (`lib/library.ts`, `lib/prefs.ts`, `lib/affinity.ts`, all built on `lib/store.ts`). No database, no accounts — deliberate product decision, not a TODO. Don't add server-side persistence or auth.
- **MIX feed algorithm.** `lib/recommend.ts` is pure: seeded PRNG (mulberry32) + weighted sampling across *age buckets* (today / week / month / year / older, measured from the newest clip) over the listings fetched by `lib/pools.ts`. Kick's "top this week/month" listings are dominated by the last few days, so never weight by listing — weight by `ageBucket`. Channel and category feeds have their own MIX with even weights (`scopedMixPage`). The seed (and the favorites snapshot sent with it) must stay stable within a deck so pagination is deterministic — don't reseed or refresh favorites between pages.
- **i18n.** `lib/i18n/messages.ts` holds EN/ES/PT; English defines the keys and the other locales are typed against it. The locale comes from the `highkick-locale` cookie (set in Settings) and otherwise defaults to English — `Accept-Language` is deliberately ignored (`lib/i18n/server.ts`). It reaches client components through `I18nProvider`/`useI18n`.
- **Dead clips are dropped client-side.** Kick still lists clips whose video is gone from its CDN (mostly old ones). `lib/playable.ts` probes the clips just ahead of the viewer (playlist → variant → first segment) and `ClipCard` reports fatal player errors; only a 4xx or a non-playlist body marks a clip unplayable (remembered in localStorage) — offline, timeouts and 5xx never do.
- **URL mirroring.** `/{channel}/clips/{id}`, `/{channel}` and `/category/{slug}` mirror kick.com so a domain swap works. The redirecting mirrors live outside the `(app)` group on purpose (see Gotchas).

## File map

```
app/
  layout.tsx                 html/body, fonts, locale, metadata (metadataBase from request)
  (app)/layout.tsx           app shell: NavBar, SearchOverlay, ShortcutsHelp, Toaster
  (app)/page.tsx             home feed; ?feed=following|top|new
  (app)/c/[slug]/            channel feed + ChannelHeader
  (app)/g/[slug]/            category feed
  (app)/[channel]/clips/[id] clip deep link with OG metadata
  (app)/explore|search|library|settings/
  (app)/loading.tsx error.tsx
  [channel]/page.tsx         kick.com/{channel} mirror → /c/{channel}
  category/[slug]/page.tsx   kick.com/category/{slug} mirror → /g/{slug}
  embed/[channel]/           iframe-able player (only framable route)
  api/feed|clips|following|channels|search|health/route.ts
  sitemap.ts robots.ts opengraph-image.tsx manifest.ts not-found.tsx global-error.tsx
components/
  Feed.tsx                   snap-scroll container: sources (home/scope/static), modes, paging, keyboard
  ClipCard.tsx               HLS player, action rail, follow/live/share/menu, watch-time signal
  TopBar.tsx NavBar.tsx      feed controls; bottom tabs (phone) / side rail (desktop)
  Sheet.tsx ShareSheet.tsx   modal sheets
  SearchPanel.tsx SearchOverlay.tsx ShortcutsHelp.tsx Toaster.tsx
  ChannelBar.tsx LiveFollowing.tsx ClipTile.tsx PageShell.tsx LibraryView.tsx SettingsView.tsx HScroll.tsx
  I18nProvider.tsx ServiceWorker.tsx icons.tsx
lib/
  kick/types.ts              HighKick data model + URL helpers (safe for client components)
  kick/normalize.ts          Kick JSON → model
  kick/http.ts               impit client, cache, breakers, stats
  kick/api.ts index.ts       Kick endpoints (server only)
  pools.ts feeds.ts          server feed builders: MIX, Following, Explore, search, deep links
  recommend.ts trending.ts   pure ranking/aggregation
  text.ts format.ts          matching, number/date formatting
  store.ts library.ts prefs.ts affinity.ts   localStorage stores
  playable.ts                dead-clip probe + remembered unplayable ids
  live-client.ts commands.ts toast.ts        client helpers
  api.ts rate-limit.ts site.ts                route-handler helpers
  i18n/                      config, messages, server locale resolution
tests/                       unit tests
public/sw.js                 offline app shell service worker
```

## Conventions

- **App Router only.** Server components by default; add `'use client'` only where needed.
- **Client components import Kick types from `@/lib/kick/types`**, never from `@/lib/kick` (that pulls the native impit module into the client bundle).
- **Every user-visible string goes through `t()`** and must be added to all three locales.
- **Tailwind v4.** Utility classes only; theme tokens live in `globals.css` under `@theme`. `--nav-h`/`--nav-w` describe the space taken by navigation.
- **TypeScript strict.** All code must type-check.
- **localStorage access must be guarded** — use `createStore` from `lib/store.ts`, which handles SSR, parsing and cross-tab sync, and read it through `useSyncExternalStore`.
- **Comments explain WHY, never WHAT.**

## Gotchas

- **HLS playback is two-branch:** `ClipCard.tsx` prefers hls.js even when the browser claims native HLS support, because Chrome answers `"maybe"` to the HLS MIME type but can't demux it; only Safari takes the native `canPlayType` branch. Test video changes in both.
- **The cache hides your changes:** when iterating on `lib/kick/` or the API routes, cached (or stale-if-error) responses can make a fix look ineffective. Restart the server or wait out the TTL. `/api/health` shows cache hits and breaker state.
- **A Cloudflare 403 from Kick means TLS fingerprinting or a distrusted egress IP**, not bad credentials or a wrong URL. The fix is always "route it through `kickGet`", never extra headers or retries.
- **`loading.tsx` turns redirects/notFound into 200s.** Streaming commits the status before `redirect()`/`notFound()` run, which is why the kick.com URL mirrors live outside `(app)`. Keep routes that must return real 3xx/404 outside segments with a loading boundary.
- **Next 16 error boundaries receive `unstable_retry`,** not `reset`, for re-fetching.
- **Playwright's bundled Chromium has no H.264/AAC**, so Kick's clips won't decode there; use real Chrome, or a VP9/Opus fMP4 HLS fixture, to test playback.
